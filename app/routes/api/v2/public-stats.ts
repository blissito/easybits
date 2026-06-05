import { getPublicStats } from "~/.server/core/publicStats";

// GET /api/v2/public-stats — unauthenticated platform metrics for the marketing
// site (started sandboxes + monthly npm downloads). Cached 6h server-side.
export async function loader() {
  const stats = await getPublicStats();
  return Response.json(stats, {
    headers: { "Cache-Control": "public, max-age=21600" },
  });
}
