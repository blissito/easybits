import type { Route } from "./+types/machines-collection";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { MachineCreateBody } from "~/.server/sandbox/schemas";
import {
  createPermanent,
  makePermanent,
  listPermanent,
} from "~/.server/core/machineOperations";

// GET /api/v2/machines — view of the caller's permanent sandboxes (by sandboxId)
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const machines = await listPermanent(ctx);
  return Response.json({ machines });
}

// POST /api/v2/machines — provision a permanent sandbox, or promote an existing
// ephemeral one (when `fromSandboxId` is set).
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "create");
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const parsed = MachineCreateBody.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { fromSandboxId, ...rest } = parsed.data;
  const result = fromSandboxId
    ? await makePermanent(ctx, fromSandboxId, {
        tier: rest.tier,
        cpuMode: rest.cpuMode,
        diskAddonsGB: rest.diskAddonsGB,
        name: rest.name,
      })
    : await createPermanent(ctx, rest);
  return Response.json(result);
}
