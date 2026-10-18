import type { Route } from "./+types/cron-runs";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { listUserCronRuns } from "~/.server/core/userCronOperations";

// GET /api/v2/crons/:id/runs?limit=20 — últimas corridas, la más reciente primero
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const limit = Number(new URL(request.url).searchParams.get("limit") || 20);
  const items = await listUserCronRuns(ctx, params.id!, Number.isFinite(limit) ? limit : 20);
  return Response.json({ items, nextCursor: null, hasMore: false, total: items.length });
}
