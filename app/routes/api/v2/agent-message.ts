import type { Route } from "./+types/agent-message";
import { resolveAgentAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import {
  openAgentChunkStream,
  wakeAgentForMessage,
} from "~/.server/core/sandboxOperations";
import { markAgentBusy, markAgentIdle } from "~/.server/core/embedAgentReaper";

// CORS: el endpoint /api/v2/agents/:id/message lo consume el browser desde
// el sitio del cliente (iframe embed) → debe permitir cualquier origen.
// El bearer token (embedToken o eb_sk) es el control de acceso real.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

// React Router v7 NO enruta OPTIONS al action automáticamente — devuelve
// 400 antes de llegar. Exporto loader para que el framework acepte la
// request y respondamos preflight ahí.
export async function loader({ request }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// POST /api/v2/agents/:id/message  (action)
//
// Auth: owner (eb_sk_* / session) OR embed (agt_*).
//
// Goes through sandbox-host's /v1/sandbox/:sbid/agent/message proxy because
// EasyBits Fly has no route to the microVM's internal subnet. sandbox-host
// streams the agent's SSE upstream; we re-emit it to the caller verbatim.
export async function action({ request, params }: Route.ActionArgs) {
  const auth = await resolveAgentAuth(request, params.id!);
  // Keyed por agentId (no por owner): el chat público del embed no debe drenar
  // el presupuesto de sandbox del dueño ni el de otros agentes.
  const limited = await applySandboxRateLimit(auth.agent.agentId, "op");
  if (limited) {
    const headers = new Headers(limited.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    return new Response(limited.body, { status: limited.status, headers });
  }
  const body = await request.json().catch(() => ({}));
  if (typeof body?.content !== "string" || !body.content.trim()) {
    return Response.json(
      { error: "content (string) required" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Wake-on-message: si el reaper de idle-suspend (A3) suspendió esta VM, la
  // revivimos antes de abrir el stream. También bump lastMessageAt → marca la
  // actividad que el reaper consulta. Si el plan está al tope, propaga el 503.
  try {
    await wakeAgentForMessage(auth.agent.agentId);
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers);
      for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
      return new Response(e.body, { status: e.status, headers });
    }
    return Response.json(
      { error: e instanceof Error ? e.message : "wake failed" },
      { status: 502, headers: CORS_HEADERS }
    );
  }

  // Marca el agente busy mientras dura el turno → el reaper de idle-suspend no
  // lo suspende a mitad del stream. Se libera al cerrar/cancelar el stream.
  markAgentBusy(auth.agent.agentId);

  let stream;
  try {
    // sessionId opcional: si no viene (o no es string), omitimos. El daemon
    // genera un UUID fresh y lo devuelve via newSessionId al closing event.
    // ANTES defaultaba a "default" pero Claude CLI rechaza ese literal con
    // "--resume requires UUID format".
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    stream = await openAgentChunkStream(auth.agent, {
      content: body.content,
      ...(sessionId ? { sessionId } : {}),
    });
  } catch (e) {
    markAgentIdle(auth.agent.agentId);
    return Response.json(
      { error: e instanceof Error ? e.message : "upstream error" },
      { status: 502, headers: CORS_HEADERS }
    );
  }

  // Envuelve el stream para liberar el busy-flag cuando termine, falle o el
  // cliente cancele (el action retorna antes de que el SSE acabe — el turno vive
  // en el stream). TransformStream.Transformer no tiene `cancel`, así que usamos
  // un ReadableStream manual que cubre los tres caminos.
  const agentId = auth.agent.agentId;
  const reader = stream.getReader();
  const monitored = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          markAgentIdle(agentId);
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (e) {
        markAgentIdle(agentId);
        controller.error(e);
      }
    },
    cancel(reason) {
      markAgentIdle(agentId);
      return reader.cancel(reason);
    },
  });

  return new Response(monitored, {
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
