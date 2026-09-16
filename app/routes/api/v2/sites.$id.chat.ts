import type { Route } from "./+types/sites.$id.chat";
import { db } from "~/.server/db";
import { getUserOrNull } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import { withAdmitRetry } from "~/.server/core/fleetAdmitHold";
import { routeMessage, FleetAgentAtCapacity } from "~/.server/core/fleetAgentOperations";
import { ensureBuilderAgent, getSite, siteGroupId, siteTurnPrompt } from "~/.server/core/siteOperations";

// Chat del creador de sitios. Auth = sesión del dueño (el token del builder NUNCA
// baja al browser). Mismo SSE que fleet-agents/:id/message-stream: `chunk`,
// `tool`, `done`, `error`, `capacity`. GET = historial (FleetAgentMessage).
async function ctxFor(request: Request) {
  const user = await getUserOrNull(request).catch(() => null);
  if (!user) throw Response.json({ error: "Unauthorized" }, { status: 401 });
  return { user, scopes: ["READ", "WRITE"] } as AuthContext;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = await ctxFor(request);
  await getSite(ctx, params.id!);
  const builder = await ensureBuilderAgent(ctx);
  const rows = await db.fleetAgentMessage.findMany({
    where: { fleetAgentId: builder.id, groupId: siteGroupId(params.id!) },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { role: true, text: true, createdAt: true },
  });
  return Response.json({ messages: rows });
}

export async function action({ request, params }: Route.ActionArgs) {
  const ctx = await ctxFor(request);
  const site = await getSite(ctx, params.id!);
  const builder = await ensureBuilderAgent(ctx);
  const body = await request.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "text required" }, { status: 400 });
  const selection =
    body?.selection && typeof body.selection.id === "string" && typeof body.selection.tag === "string"
      ? { id: body.selection.id.slice(0, 80), tag: body.selection.tag.slice(0, 20) }
      : null;

  const encoder = new TextEncoder();
  const sse = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Keep-alive: un cold spawn tarda ~30s sin emitir nada.
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ka\n\n`)); } catch { /* cerrado */ }
      }, 15_000);
      try {
        const reply = await withAdmitRetry(() =>
          routeMessage(
            builder.id,
            {
              groupId: siteGroupId(site.id),
              sender: "sitios",
              // La selección va EN el texto (no solo en el system append): en una
              // sesión caliente el appendSystemPrompt por turno no siempre llega.
              text: selection
                ? `[Elemento seleccionado en la vista previa: <${selection.tag} data-eb-id="${selection.id}">. Modifica SOLO ese nodo.]\n${text}`
                : text,
              appendSystemPrompt: siteTurnPrompt(site, selection),
            },
            {
              onChunk: (value) => controller.enqueue(sse({ type: "chunk", value })),
              onTool: (name, ev) => controller.enqueue(sse({ type: "tool", name, phase: ev?.phase, ok: ev?.ok })),
            }
          )
        );
        controller.enqueue(sse({ type: "done", value: reply }));
      } catch (e) {
        if (e instanceof FleetAgentAtCapacity) {
          controller.enqueue(sse({ type: "capacity", message: e.message, retryAfter: 10 }));
        } else {
          controller.enqueue(sse({ type: "error", message: e instanceof Error ? e.message : "error" }));
        }
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
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
