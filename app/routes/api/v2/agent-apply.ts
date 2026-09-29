import type { Route } from "./+types/agent-apply";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { machineErrorResponse } from "~/.server/core/agentMachineOperations";
import { parseAgentSpec } from "~/.server/core/agentSpec";
import { applyAgentSpec, readApplyBody } from "~/.server/core/agentSpecOperations";

// Aplica un archivo de agente sobre uno existente (declarativo, ver agentSpec.ts).
//   POST /api/v2/agents/:id/apply { spec (texto YAML/JSON), secrets?, skills?, files?, prune?, dryRun?, name? }
//   → { agent, dryRun, plan: [{op,what}], applied?, failed?, before? }
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "op");
  if (limited) return limited;
  const body = await readApplyBody(request);
  if (body instanceof Response) return body;
  let spec;
  try {
    spec = parseAgentSpec(body.spec);
  } catch (e) {
    return Response.json({ error: "invalid_spec", message: (e as Error).message }, { status: 400 });
  }
  // `apply --create --name X` aplica el resto del archivo al nuevo sin devolverle el nombre del archivo.
  if (typeof body.name === "string" && body.name.trim()) spec.name = body.name.trim();
  try {
    return Response.json(
      await applyAgentSpec(ctx, params.id!, spec, {
        prune: body.prune,
        dryRun: body.dryRun,
        secrets: body.secrets,
        uploads: { skills: body.skills, files: body.files },
      })
    );
  } catch (e) {
    return machineErrorResponse(e);
  }
}
