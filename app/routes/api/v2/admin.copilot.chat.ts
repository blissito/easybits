import type { Route } from "./+types/admin.copilot.chat";
import { db } from "~/.server/db";
import {
  ADMIN_COPILOT_NAME,
  adminCopilotGroupId,
  copilotAfterTool,
  copilotTurnText,
  ensureAdminCopilot,
  parseCopilotContext,
  permissionEvent,
  requireAdminSession,
} from "~/.server/core/adminCopilot";
import { listPendingActions } from "~/.server/core/agentActions";
import {
  AppDraining,
  siteTurnStatus,
  startAgentTurn,
  subscribeSiteTurn,
  TERMINAL_TURN_EVENTS,
  TurnBusy,
  type TurnEvent,
} from "~/.server/core/siteTurns.server";

// Chat del copiloto del panel de crons. Sesión de superusuario (nunca Bearer). El turno vive
// aparte de la petición (siteTurns.server.ts): POST lo arranca y se suscribe; si el navegador
// se va, sigue, y `GET ?attach=1` se re-engancha (snapshot + en vivo + permisos abiertos).
// GET sin attach = historial + permisos pendientes + estado del turno.
//
// SSE con NOMBRE de evento, como el chat /c de Ghosty (`event: <nombre>\ndata: <json>`):
//   started      { turnId? }
//   snapshot     { turnId, text, tools }            (sólo attach)
//   chunk        { text, turnId }
//   tool         { title, status: "in_progress"|"completed"|"failed" }
//   permission   { id, title, tool, expiresAt, options:[{optionId,name,kind}] }
//   done         { turnId, text }
//   error        { message } · capacity { message, retryAfter } · interrupted { turnId, canContinue } · idle {}
// Aprobar/rechazar: POST /api/v2/admin/agent-actions/:id { decision } (con la sesión).

function toSse(e: TurnEvent, turnId: string | null): [string, unknown] {
  switch (e.type) {
    case "chunk":
      return ["chunk", { text: e.value, turnId }];
    case "tool":
      return ["tool", { title: e.name, status: e.phase === "end" ? (e.ok === false ? "failed" : "completed") : "in_progress" }];
    case "done":
      return ["done", { turnId: e.turnId ?? turnId, text: e.value }];
    case "snapshot":
      return ["snapshot", { turnId: e.turnId, text: e.text, tools: e.tools }];
    default: {
      const { type, ...rest } = e;
      return [type, rest];
    }
  }
}

function turnStream(request: Request, groupId: string, opts: { turnId: string | null; snapshot: boolean; ownerId: string }) {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let turnId = opts.turnId;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        try { controller.close(); } catch { /* ya cerrado */ }
      };
      const write = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          close();
        }
      };
      const send = (e: TurnEvent) => {
        if (typeof e.turnId === "string") turnId = e.turnId;
        const [event, data] = toSse(e, turnId);
        write(event, data);
        if (TERMINAL_TURN_EVENTS.has(e.type) || e.type === "idle") close();
      };
      controller.enqueue(encoder.encode(`retry: 2000\n\n`));
      write("started", turnId ? { turnId } : {});
      // Quien se re-engancha necesita el ESTADO: las tarjetas que siguen esperando.
      if (opts.snapshot) {
        for (const a of await listPendingActions(opts.ownerId).catch(() => [])) {
          const { type, ...rest } = permissionEvent(a);
          write(type, rest);
        }
      }
      heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ka\n\n`)); } catch { close(); }
      }, 15_000);
      unsubscribe = subscribeSiteTurn(groupId, send, { snapshot: opts.snapshot });
      request.signal.addEventListener("abort", close);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const ctx = await requireAdminSession(request);
  const groupId = adminCopilotGroupId(ctx.user.id);
  const q = new URL(request.url).searchParams;
  if (q.get("attach")) return turnStream(request, groupId, { turnId: null, snapshot: true, ownerId: ctx.user.id });
  const agent = await db.fleetAgent.findFirst({
    where: { ownerId: ctx.user.id, name: ADMIN_COPILOT_NAME },
    select: { id: true },
  });
  const messages = agent
    ? await db.fleetAgentMessage.findMany({
        where: { fleetAgentId: agent.id, groupId },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: { role: true, text: true, createdAt: true },
      })
    : [];
  const pending = await listPendingActions(ctx.user.id);
  return Response.json({ messages, pending: pending.map(permissionEvent), ...(await siteTurnStatus(groupId)) });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const ctx = await requireAdminSession(request);
  const body = await request.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 4000) : "";
  if (!text) return Response.json({ error: "text required" }, { status: 400 });
  const context = parseCopilotContext(body?.context);
  const agent = await ensureAdminCopilot(ctx);
  const groupId = adminCopilotGroupId(ctx.user.id);
  let turnId: string;
  try {
    ({ turnId } = await startAgentTurn(ctx, {
      surface: "admin-copilot",
      groupId,
      fleetAgentId: agent.id,
      sender: "admin-copilot",
      text,
      turnId: typeof body?.turnId === "string" ? body.turnId : undefined,
      continueTurnId: typeof body?.continueTurnId === "string" ? body.continueTurnId : undefined,
      prepare: async (agentText) => ({ text: copilotTurnText(agentText, context) }),
      afterTool: copilotAfterTool(ctx.user.id),
    }));
  } catch (e) {
    if (e instanceof AppDraining) {
      return Response.json({ error: "draining", message: e.message }, { status: 503, headers: { "Retry-After": "3" } });
    }
    if (e instanceof TurnBusy) {
      return Response.json({ error: "turn_busy", message: e.message, activeTurnId: e.activeTurnId }, { status: 409 });
    }
    throw e;
  }
  return turnStream(request, groupId, { turnId, snapshot: false, ownerId: ctx.user.id });
}
