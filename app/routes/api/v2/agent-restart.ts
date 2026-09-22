import type { Route } from "./+types/agent-restart";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { machineErrorResponse, restartAgentMachine } from "~/.server/core/agentMachineOperations";

// POST /api/v2/agents/:id/restart — rearranca el unit y rehace el handshake ACP: aplica
// skills, MCP y PROMPT.mode sin recrear la caja. Pierde la conversación en curso.
// 409 agente_sin_maquina en templates sin máquina propia. Contrato de gs.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "op");
  if (limited) return limited;
  try {
    return Response.json(await restartAgentMachine(ctx, params.id!));
  } catch (e) {
    return machineErrorResponse(e);
  }
}
