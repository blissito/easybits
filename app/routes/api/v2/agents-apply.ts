import type { Route } from "./+types/agents-apply";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { machineErrorResponse } from "~/.server/core/agentMachineOperations";
import { parseAgentSpec } from "~/.server/core/agentSpec";
import { createFromSpec, readApplyBody } from "~/.server/core/agentSpecOperations";

// Crea un agente desde un archivo (`easybits apply <file> --create`): template, nombre, env,
// MCP y prompt. Skills y archivos entran después con POST /agents/:id/apply sobre el nuevo.
//   POST /api/v2/agents/apply { spec, secrets?, name?, timeoutSeconds?, dryRun? }
//   → { dryRun, plan, agentId?, sandboxId? }
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const ctx = requireAuth(await authenticateRequest(request));
  const body = await readApplyBody(request);
  if (body instanceof Response) return body;
  if (!body.dryRun) {
    const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "create");
    if (limited) return limited;
  }
  let spec;
  try {
    spec = parseAgentSpec(body.spec);
  } catch (e) {
    return Response.json({ error: "invalid_spec", message: (e as Error).message }, { status: 400 });
  }
  try {
    return Response.json(
      await createFromSpec(ctx, spec, {
        secrets: body.secrets,
        name: typeof body.name === "string" ? body.name : undefined,
        dryRun: body.dryRun,
        timeoutSeconds: typeof body.timeoutSeconds === "number" ? body.timeoutSeconds : undefined,
      })
    );
  } catch (e) {
    return machineErrorResponse(e);
  }
}
