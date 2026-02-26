import type { Route } from "./+types/file-search";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { searchFilesWithAI } from "~/.server/core/ai";

// GET /api/v2/files/search?q=...
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  if (!query) {
    return Response.json({ error: "Query parameter 'q' is required" }, { status: 400 });
  }

  const results = await searchFilesWithAI(ctx.user.id, query);
  return Response.json({ items: results });
}
