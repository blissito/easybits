import type { Route } from "./+types/admin.copilot.chat";
import { db } from "~/.server/db";
import {
  ADMIN_COPILOT_NAME,
  adminCopilotGroupId,
  copilotAfterTool,
  copilotTurnText,
  cronsBrief,
  ensureAdminCopilot,
  parseCopilotContext,
  requireAdminSession,
  stripCopilotContext,
} from "~/.server/core/adminCopilot";
import { listPendingActions, resolveAgentAction } from "~/.server/core/agentActions";
import { tryDirectCommand } from "~/.server/core/copilotFastPath";
import {
  AppDraining,
  cancelAgentTurn,
  siteTurnStatus,
  startAgentTurn,
  subscribeSiteTurn,
  TurnBusy,
  type TurnEvent,
} from "~/.server/core/siteTurns.server";
import {
  agUiStream,
  createTurnTranslator,
  interruptFrom,
  parseRunAgentInput,
  runFinished,
  toAgUiMessages,
  turnIdFromRunId,
  userText,
  type AgUiEvent,
  type RunAgentInput,
} from "~/.server/core/agui";

// Piloto del panel de crons, en AG-UI (docs/protocol.md de ghostykit). UN endpoint:
// `POST` con `RunAgentInput` → SSE de eventos AG-UI. Sesión de superusuario y nada más (una
// llave del agente nunca aprueba). Tres formas del mismo POST:
//   · con mensaje del usuario → corre un turno (durable: sigue aunque el navegador se vaya);
//   · con `resume` → aprueba/rechaza las propuestas (AgentAction: una vez, vence a 15 min);
//   · vacío → abre/reconecta: MESSAGES_SNAPSHOT + el turno vivo, las tarjetas abiertas o éxito.
// Las propuestas (run_cron, pause_cron, crons del usuario) terminan el run con
// `outcome: interrupt`. Cerrar la conexión NUNCA detiene el turno (sobrevive recargas y
// deploys); detener es `forwardedProps.cancel = <runId>` → `RUN_FINISHED {outcome: cancelled}`.

const json = (status: number, body: Record<string, unknown>, headers?: Record<string, string>) =>
  Response.json(body, { status, headers });

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed", message: "Usa POST." });
  const ctx = await requireAdminSession(request);
  const input = parseRunAgentInput(await request.json().catch(() => null));
  if (!input) return json(400, { error: "bad_request", message: "RunAgentInput inválido (threadId y runId son obligatorios)." });
  const owner = { id: ctx.user.id, email: ctx.user.email };
  const groupId = adminCopilotGroupId(owner.id);
  const text = userText(input).slice(0, 4000);

  // Detener: pedido explícito (desconectarse nunca detiene nada). Idempotente.
  if (input.cancel) {
    const turnId = turnIdFromRunId(input.cancel);
    const out = turnId ? await cancelAgentTurn(groupId, turnId) : "not_found";
    if (out === "elsewhere") {
      return json(503, { error: "draining", message: "Ese turno corre en la instancia que se está apagando; reintenta en unos segundos." }, { "Retry-After": "3" });
    }
    return agUiStream(request, (emit) => {
      emit({ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId });
      emit({ type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId, timestamp: Date.now(), outcome: { type: "cancelled" } });
    });
  }

  // Primero las respuestas a las tarjetas (pueden venir solas o junto con un mensaje nuevo).
  const resumed = input.resume?.length ? await resolveResumes(owner, groupId, input) : null;
  const start = (emit: (e: AgUiEvent) => void) => {
    emit({ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId });
    for (const e of resumed?.events ?? []) emit(e);
  };
  if (resumed?.error) {
    return agUiStream(request, (emit) => {
      start(emit);
      emit(resumed.error!);
    });
  }
  if (!text) {
    if (!resumed) return reconnect(request, owner.id, groupId, input);
    // Si quedaron tarjetas sin contestar, el run sigue en pausa por ellas.
    const left = (await listPendingActions(owner.id)).map((a) => interruptFrom(a));
    return agUiStream(request, (emit) => {
      start(emit);
      emit(runFinished(input.threadId, input.runId, left));
    });
  }

  // Con tarjetas sin contestar no se abre otro turno: el cliente reconecta y las enseña.
  const pending = await listPendingActions(owner.id);
  if (pending.length) {
    return json(409, { error: "interrupt_pending", message: "Hay acciones esperando tu aprobación.", interrupts: pending.map((a) => interruptFrom(a)) });
  }
  // Orden directa («ejecuta purga de notificaciones»): tarjeta al instante, sin modelo.
  const direct = await tryDirectCommand(owner.id, text);
  if (direct) {
    const existing = await db.fleetAgent.findFirst({ where: { ownerId: owner.id, name: ADMIN_COPILOT_NAME }, select: { id: true } });
    if (existing) {
      await db.fleetAgentMessage
        .createMany({
          data: [
            // createdAt explícito: el snapshot ordena por fecha y deben salir en este orden.
            { fleetAgentId: existing.id, groupId, role: "user", text, createdAt: new Date(Date.now() - 1) },
            { fleetAgentId: existing.id, groupId, role: "agent", text: direct.question, createdAt: new Date() },
          ],
        })
        .catch(() => undefined);
    }
    return agUiStream(request, (emit) => {
      start(emit);
      const messageId = `msg-${input.runId}-direct`;
      emit({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
      emit({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: direct.question });
      emit({ type: "TEXT_MESSAGE_END", messageId });
      emit(runFinished(input.threadId, input.runId, [interruptFrom(direct.action)]));
    });
  }

  const context = parseCopilotContext(screenContext(input));
  const agent = await ensureAdminCopilot(ctx);
  try {
    await startAgentTurn(ctx, {
      surface: "admin-copilot",
      groupId,
      fleetAgentId: agent.id,
      sender: "admin-copilot",
      text,
      turnId: turnIdFromRunId(input.runId),
      prepare: async (agentText) => ({ text: copilotTurnText(agentText, context, await cronsBrief().catch(() => undefined)) }),
      afterTool: copilotAfterTool(owner.id),
    });
  } catch (e) {
    if (e instanceof AppDraining) return json(503, { error: "draining", message: e.message }, { "Retry-After": "3" });
    if (e instanceof TurnBusy) return json(409, { error: "run_active", message: e.message, runId: e.activeTurnId });
    throw e;
  }
  return agUiStream(request, (emit, onClose) => {
    start(emit);
    const t = createTurnTranslator({ threadId: input.threadId, runId: input.runId, emit });
    // Con snapshot: lo que el turno alcanzó a decir antes de que esta conexión se suscribiera.
    onClose(subscribeSiteTurn(groupId, followTurn(t, owner.id), { snapshot: true }));
  });
}

/**
 * `context` de AG-UI → `{page, job}` del panel. Acepta una entrada `screen` con el JSON entero
 * o una entrada por llave (`{description:"job", value:"\"purge-keys\""}`), que es lo que manda Piloto.
 */
function screenContext(input: RunAgentInput): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const c of input.context) {
    let v: unknown = c.value;
    try {
      v = JSON.parse(c.value);
    } catch {
      /* texto plano */
    }
    if (c.description === "screen" && v && typeof v === "object") Object.assign(out, v);
    else out[c.description] = v;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Pasa los eventos del turno al traductor; al terminar bien, las tarjetas salen de la base
 * (una `permission` emitida antes de suscribirse no se pierde).
 */
function followTurn(t: ReturnType<typeof createTurnTranslator>, ownerId: string) {
  return (e: TurnEvent) => {
    if (e.type !== "done" && e.type !== "idle") return t.onTurnEvent(e);
    void listPendingActions(ownerId)
      .then((p) => t.finishWith(p.map((a) => interruptFrom(a))))
      .catch(() => t.finishWith([]));
  };
}

/** Abrir o reconectar: el hilo guardado y luego el turno vivo, las tarjetas o éxito. */
async function reconnect(request: Request, ownerId: string, groupId: string, input: RunAgentInput) {
  const agent = await db.fleetAgent.findFirst({ where: { ownerId, name: ADMIN_COPILOT_NAME }, select: { id: true } });
  const rows = agent
    ? await db.fleetAgentMessage.findMany({
        where: { fleetAgentId: agent.id, groupId },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { id: true, role: true, text: true },
      })
    : [];
  const status = await siteTurnStatus(groupId);
  const pending = (await listPendingActions(ownerId)).map((a) => interruptFrom(a));
  return agUiStream(request, (emit, onClose) => {
    emit({ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId });
    emit({ type: "MESSAGES_SNAPSHOT", messages: toAgUiMessages(rows.reverse(), stripCopilotContext) });
    const t = createTurnTranslator({ threadId: input.threadId, runId: input.runId, emit });
    if (!status.activeTurn) return t.finishWith(pending);
    onClose(subscribeSiteTurn(groupId, followTurn(t, ownerId), { snapshot: true }));
  });
}

const STATUS_WORDS: Record<string, string> = {
  executed: "Hecho",
  rejected: "Rechazado",
  failed: "Falló",
  expired: "Venció sin respuesta",
};

/**
 * Contestar las tarjetas. Cada propuesta se reclama con un update condicionado a `pending`
 * (agentActions.ts): repetir el mismo resume no vuelve a ejecutar, sólo cuenta cómo quedó.
 * `cancelled` (la tarjeta venció en pantalla o se descartó) rechaza sin ruido; aprobar una ya
 * vencida es `interrupt_expired`.
 */
async function resolveResumes(owner: { id: string; email: string }, groupId: string, input: RunAgentInput) {
  const events: AgUiEvent[] = [];
  let seq = 0;
  const id = (p: string) => `${p}-${input.runId}-r${++seq}`;
  const lines: string[] = [];
  let error: AgUiEvent | null = null;
  for (const r of input.resume!) {
    const row = /^[a-f0-9]{24}$/.test(r.interruptId)
      ? await db.agentAction.findFirst({ where: { id: r.interruptId, ownerId: owner.id }, select: { tool: true, summary: true } })
      : null;
    if (!row) {
      error = { type: "RUN_ERROR", code: "interrupt_not_found", message: "No encontré esa aprobación." };
      break;
    }
    const approve = r.status === "resolved" && r.payload?.approved === true;
    const out = await resolveAgentAction(owner, r.interruptId, approve ? "approve" : "reject");
    const status = out.status === "not_pending" ? out.current : out.status;
    if (status === "expired") {
      if (r.status === "resolved") error = { type: "RUN_ERROR", code: "interrupt_expired", message: `Venció sin respuesta: ${row.summary}. Pídela de nuevo.` };
      continue;
    }
    const toolCallId = id("tc");
    events.push(
      // Un paso aparte de la propuesta (que fue `run_cron`…): éste es la decisión aplicada.
      { type: "TOOL_CALL_START", toolCallId, toolCallName: "confirm_action" },
      { type: "TOOL_CALL_END", toolCallId },
      {
        type: "TOOL_CALL_RESULT",
        messageId: id("tool"),
        toolCallId,
        role: "tool",
        content: JSON.stringify(
          out.status === "executed" ? { status, result: out.result } : out.status === "failed" ? { status, error: out.error } : { status }
        ),
        ...(status === "failed" ? { metadata: { error: true } } : {}),
      }
    );
    const again = out.status === "not_pending" ? " (ya estaba resuelta)" : "";
    lines.push(`${STATUS_WORDS[status] ?? status}${again}: ${row.summary}${out.status === "failed" ? ` — ${out.error}` : ""}`);
  }
  if (lines.length) {
    const text = lines.join("\n");
    const messageId = id("msg");
    events.push(
      { type: "TEXT_MESSAGE_START", messageId, role: "assistant" },
      { type: "TEXT_MESSAGE_CONTENT", messageId, delta: text },
      { type: "TEXT_MESSAGE_END", messageId }
    );
    // Al hilo, para que el snapshot y el propio agente sepan cómo quedó.
    const agent = await db.fleetAgent.findFirst({ where: { ownerId: owner.id, name: ADMIN_COPILOT_NAME }, select: { id: true } });
    if (agent) await db.fleetAgentMessage.create({ data: { fleetAgentId: agent.id, groupId, role: "agent", text } }).catch(() => undefined);
  }
  return { events, error };
}
