import type { Route } from "./+types/document-images";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { exportDocumentImages } from "~/.server/core/documentScreenshot";

// GET /api/v2/documents/:id/images?sections=id1,id2
// Renders each page to a PNG, uploads to public storage, returns file records.
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);
  const sectionsParam = url.searchParams.get("sections");
  const sectionIds = sectionsParam
    ? sectionsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const files = await exportDocumentImages(ctx.user.id, params.id!, { sectionIds });
  if (!files) {
    return Response.json(
      { error: "Document not found, has no pages, or rendering failed" },
      { status: 404 },
    );
  }
  return Response.json({ files });
}
