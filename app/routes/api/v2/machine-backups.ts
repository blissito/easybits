import type { Route } from "./+types/machine-backups";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { createBackup, listBackups } from "~/.server/core/machineBackupOperations";

// GET /api/v2/machines/:id/backups — daily off-host data backups, newest first.
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);
  const result = await listBackups(ctx, {
    sandboxId: params.id,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  return Response.json(result);
}

// POST /api/v2/machines/:id/backups — take one right now.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "create");
  if (limited) return limited;
  return Response.json(await createBackup(ctx, params.id));
}
