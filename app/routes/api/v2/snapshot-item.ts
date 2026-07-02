import type { Route } from "./+types/snapshot-item";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { deleteSnapshot, forkSandbox } from "~/.server/core/sandboxOperations";

// DELETE /api/v2/snapshots/:id — delete a snapshot (host files + catalog row)
// POST   /api/v2/snapshots/:id/fork ↔ POST /api/v2/snapshots/:id — fork N children
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "op");
  if (limited) return limited;

  if (request.method === "DELETE") {
    return Response.json(await deleteSnapshot(ctx, params.id));
  }
  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    return Response.json(
      await forkSandbox(ctx, {
        snapshotId: params.id,
        count: body.count,
        name: body.name,
        metadata: body.metadata,
        timeoutSeconds: body.timeoutSeconds,
      })
    );
  }
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
