import type { Route } from "./+types/usage";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getUsageStats } from "~/.server/core/operations";

// GET /api/v2/usage
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await getUsageStats(ctx);
  return Response.json(result);
}
