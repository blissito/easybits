import type { Route } from "./+types/agent-message";
import { resolveAgentAuth } from "~/.server/apiAuth";
import { openAgentMessageStream } from "~/.server/core/sandboxOperations";

// POST /api/v2/agents/:id/message
//
// Auth: owner (eb_sk_* / session) OR embed (agt_*).
//
// Goes through sandbox-host's /v1/sandbox/:sbid/agent/message proxy because
// EasyBits Fly has no route to the microVM's internal subnet. sandbox-host
// streams the agent's SSE upstream; we re-emit it to the caller verbatim.
export async function action({ request, params }: Route.ActionArgs) {
  const auth = await resolveAgentAuth(request, params.id!);
  const body = await request.json().catch(() => ({}));
  if (typeof body?.content !== "string" || !body.content.trim()) {
    return Response.json({ error: "content (string) required" }, { status: 400 });
  }

  let stream;
  try {
    stream = await openAgentMessageStream(auth.agent.sandboxId, auth.agent.ownerId, {
      content: body.content,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : "default",
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "upstream error" },
      { status: 502 }
    );
  }

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
