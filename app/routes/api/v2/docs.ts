import type { Route } from "./+types/docs";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getDocsMarkdown } from "~/.server/docs/reference";

// GET /api/v2/docs?section=files
export async function loader({ request }: Route.LoaderArgs) {
  requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);
  const section = url.searchParams.get("section") || undefined;
  const markdown = getDocsMarkdown(section);
  return new Response(markdown, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
