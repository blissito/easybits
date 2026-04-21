import type { Route } from "./+types/videos";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { listVideoGenerations } from "~/.server/core/videoOperations";

export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 50));
  const rows = await listVideoGenerations(ctx.user.id, limit);
  return Response.json({ videos: rows });
}
