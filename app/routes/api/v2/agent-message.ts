import type { Route } from "./+types/agent-message";
import { resolveAgentAuth } from "~/.server/apiAuth";
import { openAgentMessageStream } from "~/.server/core/sandboxOperations";

// CORS: el endpoint /api/v2/agents/:id/message lo consume el browser desde
// el sitio del cliente (iframe embed) → debe permitir cualquier origen.
// El bearer token (embedToken o eb_sk) es el control de acceso real.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

// POST /api/v2/agents/:id/message  (action)
//
// Auth: owner (eb_sk_* / session) OR embed (agt_*).
//
// Goes through sandbox-host's /v1/sandbox/:sbid/agent/message proxy because
// EasyBits Fly has no route to the microVM's internal subnet. sandbox-host
// streams the agent's SSE upstream; we re-emit it to the caller verbatim.
//
// React Router v7 dispatches OPTIONS to action too — we short-circuit
// preflight here with a 204 + CORS headers.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const auth = await resolveAgentAuth(request, params.id!);
  const body = await request.json().catch(() => ({}));
  if (typeof body?.content !== "string" || !body.content.trim()) {
    return Response.json(
      { error: "content (string) required" },
      { status: 400, headers: CORS_HEADERS }
    );
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
      { status: 502, headers: CORS_HEADERS }
    );
  }

  return new Response(stream, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
