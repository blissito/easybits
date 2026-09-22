import type { Route } from "./+types/agent-mcp";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { getAgentMcp, machineErrorResponse, setAgentMcp } from "~/.server/core/agentMachineOperations";

// Servidores MCP del agente (ghosty-lite / goose). La lista viaja en `session/new`.
//   GET /api/v2/agents/:id/mcp → { servers }
//   PUT /api/v2/agents/:id/mcp { servers: [ {name,type:"http",url,headers?} | {name,command,args?,env?} ] }
//       reemplaza la lista ENTERA y reinicia el agente → { servers, reiniciado: true }
// Contrato de gs. `POST …/mcps` (openclaw) no aplica a estos templates.
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  try {
    return Response.json(await getAgentMcp(ctx, params.id!));
  } catch (e) {
    return machineErrorResponse(e);
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "PUT") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "op");
  if (limited) return limited;
  try {
    const body = (await request.json().catch(() => ({}))) as { servers?: unknown };
    return Response.json(await setAgentMcp(ctx, params.id!, body.servers ?? []));
  } catch (e) {
    return machineErrorResponse(e);
  }
}
