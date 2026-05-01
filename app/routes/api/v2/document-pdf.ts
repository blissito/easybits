import type { Route } from "./+types/document-pdf";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { takeDocumentPdf } from "~/.server/core/documentScreenshot";
import { db } from "~/.server/db";
import { verifyShareToken } from "~/.server/shareLinks";

// GET /api/v2/documents/:id/pdf?sections=id1,id2&token=<share-token>
// Auth path: cookie/API key via authenticateRequest, OR a download share token in
// the query string (issued by create_share_link with permission=download).
export async function loader({ request, params }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const shareTokenParam = url.searchParams.get("token");

  let ownerUserId: string;
  if (shareTokenParam) {
    const result = await verifyShareToken(shareTokenParam);
    if (!result.ok) {
      return Response.json({ error: `Share token ${result.reason}` }, { status: 410 });
    }
    if (result.link.resourceType !== "document" || result.link.resourceId !== params.id) {
      return Response.json({ error: "Share token does not grant access to this document" }, { status: 403 });
    }
    if (result.payload.perm !== "download" && result.payload.perm !== "edit") {
      // view permission can also download — agents commonly want both.
      if (result.payload.perm !== "view") {
        return Response.json({ error: "Permission denied" }, { status: 403 });
      }
    }
    ownerUserId = result.link.ownerId;
  } else {
    const ctx = requireAuth(await authenticateRequest(request));
    ownerUserId = ctx.user.id;
  }

  const sectionsParam = url.searchParams.get("sections");
  const sectionIds = sectionsParam
    ? sectionsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  const pdf = await takeDocumentPdf(ownerUserId, params.id!, { sectionIds });
  if (!pdf) {
    return Response.json({ error: "Document not found or has no pages" }, { status: 404 });
  }

  // Fetch doc name for filename
  const doc = await db.landing.findUnique({ where: { id: params.id! }, select: { name: true } });
  const filename = (doc?.name || "document").replace(/[^a-zA-Z0-9_\-. ]/g, "_") + ".pdf";

  const inline = url.searchParams.get("inline") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
    },
  });
}
