import type { Route } from "./+types/document-pdf";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { takeDocumentPdf } from "~/.server/core/documentScreenshot";
import { db } from "~/.server/db";

// GET /api/v2/documents/:id/pdf
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const pdf = await takeDocumentPdf(ctx.user.id, params.id!);
  if (!pdf) {
    return Response.json({ error: "Document not found or has no pages" }, { status: 404 });
  }

  // Fetch doc name for filename
  const doc = await db.landing.findUnique({ where: { id: params.id! }, select: { name: true } });
  const filename = (doc?.name || "document").replace(/[^a-zA-Z0-9_\-. ]/g, "_") + ".pdf";

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
