import type { Route } from "./+types/cron-runs";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { listUserCronRuns } from "~/.server/core/userCronOperations";

// GET /api/v2/crons/:id/runs?limit=20&logs=1 — últimas corridas, la más reciente primero (logs = stdout/stderr de `exec`)
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const q = new URL(request.url).searchParams;
  const limit = Number(q.get("limit") || 20);
  const logs = q.get("logs") === "1" || q.get("logs") === "true";
  const items = await listUserCronRuns(ctx, params.id!, Number.isFinite(limit) ? limit : 20, { logs });
  return Response.json({ items, nextCursor: null, hasMore: false, total: items.length });
}
