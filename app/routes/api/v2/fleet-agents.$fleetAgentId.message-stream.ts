import type { Route } from "./+types/fleet-agents.$fleetAgentId.message-stream";
import { db } from "~/.server/db";
import { routeMessage, FleetAgentAtCapacity, FleetAgentRateLimited } from "~/.server/core/fleetAgentOperations";
import { checkFleetAgentWebIp } from "~/.server/rateLimiter";
import type { WabaConfig } from "~/.server/integrations/whatsapp/waba.server";

// POST /api/v2/fleet-agents/:fleetAgentId/message-stream
//
// Streaming twin of /message for WEB channels (denik widget / admin assistant).
// Same auth (fleetAgent bearer token) and body, but responds SSE so the browser sees
// the reply token-by-token. Emits:
//   data: {"type":"chunk","value":"..."}   (live preview, best-effort)
//   data: {"type":"done","value":"<full>"} (authoritative final reply)
//   data: {"type":"error","message":"..."}
// The `done.value` is the full reply returned by routeMessage — clients should
// treat it as authoritative (it stays correct even if a dead-box self-heal retry
// re-emitted some chunks mid-stream).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function loader({ request }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS });
}

export async function action({ request, params }: Route.ActionArgs) {
  const fleetAgentId = params.fleetAgentId!;
  const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const fleetAgent = await db.fleetAgent.findUnique({ where: { id: fleetAgentId } });
  // Two owner-level bearers authorize this route:
  //  - fleetAgent.token: the Baileys/web surface (denik widget, admin assistant).
  //  - wabaConfig.formmySecret: the secret Formmy already holds from the WABA
  //    connect. Ghosty reuses it to drive ADMIN turns — no new credential.
  const formmySecret = (fleetAgent?.wabaConfig as WabaConfig | null)?.formmySecret ?? "";
  const byToken = !!fleetAgent && !!bearer && bearer === fleetAgent.token;
  const byFormmy = !!fleetAgent && !!bearer && !!formmySecret && bearer === formmySecret;
  if (!byToken && !byFormmy) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  // Guard por-IP: el groupId lo controla el cliente, rotarlo no debe saltar el cupo.
  if (!(await checkFleetAgentWebIp(request))) {
    return Response.json(
      { error: "rate_limited", message: "Too many requests, please slow down." },
      { status: 429, headers: { ...CORS, "Retry-After": "30" } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const groupId = typeof body?.groupId === "string" ? body.groupId : "";
  const text = typeof body?.text === "string" ? body.text : "";
  if (!groupId || !text.trim()) {
    return Response.json({ error: "groupId and text required" }, { status: 400, headers: CORS });
  }
  // ADMIN turn: inject the admin MCP + note so the agent self-administers (numbers,
  // identity, capabilities). Honored ONLY when the caller proved it holds the
  // formmySecret — the public widget token must never escalate to admin.
  const admin = byFormmy && body?.admin === true;

  const encoder = new TextEncoder();
  const sse = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const reply = await routeMessage(fleetAgentId, {
          groupId,
          sender: typeof body?.sender === "string" ? body.sender : undefined,
          text,
          mediaUrl: typeof body?.mediaUrl === "string" ? body.mediaUrl : undefined,
          denikApiKey: typeof body?.denikApiKey === "string" ? body.denikApiKey : undefined,
          appendSystemPrompt:
            typeof body?.appendSystemPrompt === "string" ? body.appendSystemPrompt : undefined,
          admin,
        }, {
          onChunk: (value) => controller.enqueue(sse({ type: "chunk", value })),
        });
        controller.enqueue(sse({ type: "done", value: reply }));
      } catch (e) {
        const message =
          e instanceof FleetAgentRateLimited
            ? e.message
            : e instanceof FleetAgentAtCapacity
              ? e.message
              : e instanceof Error
                ? e.message
                : "fleetAgent error";
        controller.enqueue(sse({ type: "error", message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
