import type { Route } from "./+types/agent-export";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { machineErrorResponse } from "~/.server/core/agentMachineOperations";
import { exportAgentSpec } from "~/.server/core/agentSpecOperations";

// El agente como archivo (ver agentSpec.ts): template, nombre, prompt, env no secreto, MCP,
// skills y archivos. Los secretos salen como `${NOMBRE}`, nunca su valor.
//   GET /api/v2/agents/:id/export            → YAML (text/yaml)
//   GET /api/v2/agents/:id/export?format=json → { spec }
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  try {
    const { spec, yaml } = await exportAgentSpec(ctx, params.id!);
    if (new URL(request.url).searchParams.get("format") === "json") return Response.json({ spec });
    return new Response(yaml, { headers: { "content-type": "text/yaml; charset=utf-8" } });
  } catch (e) {
    return machineErrorResponse(e);
  }
}
