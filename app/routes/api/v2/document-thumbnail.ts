import type { Route } from "./+types/document-thumbnail";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { takeDocumentThumbnail } from "~/.server/core/documentScreenshot";

const MAX_HTML = 300_000;

// POST /api/v2/documents/:id/thumbnail
// Body: { sectionId, html, theme?, customColors?, format?, width? }
// Renders a single page to a small PNG and returns the image bytes. Used by the
// editor PageList for accurate, server-rendered thumbnails (replaces SVG capture).
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sectionId = typeof body?.sectionId === "string" ? body.sectionId : null;
  const html = typeof body?.html === "string" ? body.html : null;
  if (!sectionId || html == null) {
    return Response.json({ error: "sectionId and html are required" }, { status: 400 });
  }
  if (html.length > MAX_HTML) {
    return Response.json({ error: "html too large" }, { status: 413 });
  }

  const theme = typeof body?.theme === "string" ? body.theme : undefined;
  const customColors =
    body?.customColors && typeof body.customColors === "object" ? body.customColors : undefined;
  const format =
    body?.format && Number(body.format.width) > 0 && Number(body.format.height) > 0
      ? { width: Number(body.format.width), height: Number(body.format.height) }
      : undefined;
  const width = Number(body?.width) > 0 ? Number(body.width) : undefined;

  const buffer = await takeDocumentThumbnail(ctx.user.id, params.id!, {
    sectionId,
    html,
    theme,
    customColors,
    format,
    width,
  });

  if (!buffer) {
    return Response.json({ error: "Document not found or rendering failed" }, { status: 404 });
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}
