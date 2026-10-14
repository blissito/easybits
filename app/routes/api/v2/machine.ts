import type { Route } from "./+types/machine";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { getPermanent, releasePermanent, setMachineSleep } from "~/.server/core/machineOperations";
import { MachineSleepBody } from "~/.server/sandbox/schemas";

// GET /api/v2/machines/:id — permanent sandbox by sandboxId (self-healed)
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const machine = await getPermanent(ctx, params.id);
  return Response.json(machine);
}

// DELETE /api/v2/machines/:id — release (stops billing + destroys VM), by sandboxId
// PATCH  /api/v2/machines/:id — { sleep: boolean }: "duerme sin visitas" ↔ siempre prendida (reprecia)
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "DELETE" && request.method !== "PATCH") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "op");
  if (limited) return limited;
  if (request.method === "PATCH") {
    const parsed = MachineSleepBody.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
    }
    return Response.json(await setMachineSleep(ctx, params.id, parsed.data.sleep));
  }
  const result = await releasePermanent(ctx, params.id);
  return Response.json(result);
}
