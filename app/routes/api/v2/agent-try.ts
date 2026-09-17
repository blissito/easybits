import type { Route } from "./+types/agent-try";
import { resolveAgentAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { openAgentChunkStream, wakeAgentForMessage } from "~/.server/core/sandboxOperations";
import { markAgentBusy, markAgentIdle } from "~/.server/core/embedAgentReaper";

// POST /api/v2/agents/:id/try — un turno completo a TEXTO, sin stream. Es el "Probar" del
// panel expuesto por token, para que un agente de código VERIFIQUE lo que acaba de
// configurar (identidad, archivos, skills, MCP) en vez de terminar en "debería funcionar".
//
// Body: { text, session?, reset? } → { text, error, session }. `session` separa memorias;
// `reset: true` la olvida (arranca sesión nueva). 409 `turno_en_curso` si ya hay un turno
// en esa sesión; 400 sin text; 404/403 token ajeno (los pone resolveAgentAuth); 502 si el
// agente terminó sin texto. 180 s máximo.
const MAX_MS = 180_000;
const inFlight = new Set<string>();

function parseEvents(chunk: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const line of chunk.split("\n")) {
    const raw = line.startsWith("data: ") ? line.slice(6) : line.trimStart().startsWith("{") ? line : null;
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {}
  }
  return out;
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const auth = await resolveAgentAuth(request, params.id!);
  const limited = await applySandboxRateLimit(auth.agent.agentId, "op");
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "text (string) required" }, { status: 400 });
  const reset = body?.reset === true;
  const session = !reset && typeof body?.session === "string" && body.session ? body.session : undefined;

  const key = `${auth.agent.agentId}:${session ?? "new"}`;
  if (session && inFlight.has(key)) {
    return Response.json({ error: "turno_en_curso", code: "turno_en_curso", session }, { status: 409 });
  }

  try {
    await wakeAgentForMessage(auth.agent.agentId);
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e instanceof Error ? e.message : "wake failed" }, { status: 502 });
  }

  inFlight.add(key);
  markAgentBusy(auth.agent.agentId);
  const started = Date.now();
  let assembled = "";
  let errorMsg: string | null = null;
  let newSession: string | undefined = session;
  try {
    const stream = await openAgentChunkStream(auth.agent, { content: text, ...(session ? { sessionId: session } : {}) });
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const timer = setTimeout(() => reader.cancel("timeout").catch(() => {}), MAX_MS);
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n\n")) !== -1) {
          const event = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 2);
          for (const evt of parseEvents(event)) {
            if (evt.type === "chunk" && typeof evt.value === "string") assembled += evt.value;
            else if (evt.type === "error") errorMsg = String(evt.message ?? "agent error");
            const sid = (evt.newSessionId ?? evt.sessionId) as string | undefined;
            if (typeof sid === "string" && sid) newSession = sid;
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }
    if (Date.now() - started >= MAX_MS && !assembled) errorMsg = errorMsg ?? "timeout (180 s)";
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "upstream error";
  } finally {
    inFlight.delete(key);
    markAgentIdle(auth.agent.agentId);
  }

  const out = { text: assembled, error: errorMsg, session: newSession ?? null, ms: Date.now() - started };
  if (!assembled && errorMsg) return Response.json(out, { status: 502 });
  return Response.json(out);
}
