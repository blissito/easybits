import type { Route } from "./+types/agent-revive";
import { resolveAgentAuth } from "~/.server/apiAuth";
import { ensureAgentBox } from "~/.server/core/sandboxOperations";

// POST /api/v2/agents/:id/revive
//
// Auth: owner (eb_sk_* / session) OR embed (agt_*) — la misma que /message.
//
// Un agente ACP tiene identidad propia (dominio fijo `acp-<id>`); si el host ya no
// tiene su caja, esto la recrea sobre la MISMA fila y devuelve la URL estable. Si la
// caja existe no hace nada. Lo llama Ghosty Teams cuando el WebSocket encuentra un
// «preview host not found», antes de reintentar el turno. Tarda lo que tarda el boot
// más el handshake (decenas de segundos): el cliente debe esperar, no reintentar.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const auth = await resolveAgentAuth(request, params.id!);
  try {
    const agent = await ensureAgentBox(auth.agent.agentId);
    return Response.json({
      agentId: agent.agentId,
      sandboxId: agent.sandboxId,
      status: agent.status,
      wsUrl: agent.agentUrl,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "revive failed" },
      { status: 503 }
    );
  }
}
