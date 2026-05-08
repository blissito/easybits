import type { Route } from "./+types/agent-message";
import { resolveAgentAuth } from "~/.server/apiAuth";

// POST /api/v2/agents/:id/message
//
// Auth: owner (eb_sk_* / session) OR embed (agt_*).
//
// Pipes the agent's text/event-stream output (Express+SSE inside the microVM)
// through to the caller without buffering. The agent already emits
// `data: {"type":"token","value":"..."}\n\n` events — we just re-emit raw bytes.
export async function action({ request, params }: Route.ActionArgs) {
  const auth = await resolveAgentAuth(request, params.id!);
  const body = await request.json().catch(() => ({}));
  if (typeof body?.content !== "string" || !body.content.trim()) {
    return Response.json({ error: "content (string) required" }, { status: 400 });
  }

  const upstream = await fetch(`${auth.agent.agentUrl}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: body.content,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : "default",
    }),
    signal: request.signal,
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return Response.json(
      { error: `agent /message → ${upstream.status}`, detail: text.slice(0, 500) },
      { status: 502 }
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
