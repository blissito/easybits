import type { Route } from "./+types/agent-skill";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { machineErrorResponse, removeAgentSkill, saveAgentSkill } from "~/.server/core/agentMachineOperations";

// Una skill del agente (ghosty-lite / goose), en /data/agent/skills/<slug>/.
//   PUT    /api/v2/agents/:id/skills/:slug  JSON { markdown, assets?: [{ name, contentBase64 }] }
//   DELETE /api/v2/agents/:id/skills/:slug
// Entra tras POST …/restart (el launcher enlaza las skills al arrancar). Contrato de gs.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "PUT" && request.method !== "DELETE") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "op");
  if (limited) return limited;
  try {
    if (request.method === "DELETE") return Response.json(await removeAgentSkill(ctx, params.id!, params.slug!));
    const body = (await request.json().catch(() => ({}))) as { markdown?: unknown; assets?: unknown };
    if (typeof body.markdown !== "string") {
      return Response.json({ error: "falta markdown (el contenido de SKILL.md)" }, { status: 400 });
    }
    const assets = Array.isArray(body.assets) ? (body.assets as Array<{ name: string; contentBase64: string }>) : [];
    return Response.json(await saveAgentSkill(ctx, params.id!, params.slug!, body.markdown, assets));
  } catch (e) {
    return machineErrorResponse(e);
  }
}
