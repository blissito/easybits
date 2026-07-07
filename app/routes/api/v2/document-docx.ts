import type { Route } from "./+types/document-docx";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { verifyShareToken } from "~/.server/shareLinks";
import type { Section3 } from "~/lib/landing3/types";

// GET /api/v2/documents/:id/docx?token=<share-token>
// Exporta el documento a Word (.docx) desde el HTML de sus sections. Mismo auth
// que el PDF: share token (view/edit/download) o cookie/API key. Para el abogado:
// un botón "Descargar Word" → doc editable en Word real.
export async function loader({ request, params }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const shareTokenParam = url.searchParams.get("token");

  let ownerUserId: string;
  if (shareTokenParam) {
    const result = await verifyShareToken(shareTokenParam);
    if (!result.ok) return Response.json({ error: `Share token ${result.reason}` }, { status: 410 });
    if (result.link.resourceType !== "document" || result.link.resourceId !== params.id) {
      return Response.json({ error: "Share token does not grant access to this document" }, { status: 403 });
    }
    if (!["download", "edit", "view"].includes(result.payload.perm)) {
      return Response.json({ error: "Permission denied" }, { status: 403 });
    }
    ownerUserId = result.link.ownerId;
  } else {
    const ctx = requireAuth(await authenticateRequest(request));
    ownerUserId = ctx.user.id;
  }

  const landing = await db.landing.findFirst({
    where: { id: params.id!, ownerId: ownerUserId, version: 4 },
    select: { name: true, sections: true },
  });
  if (!landing) return Response.json({ error: "Document not found" }, { status: 404 });

  const sections = (((landing.sections as unknown) as Section3[]) || [])
    .filter((s) => s.id !== "__grapes_css__")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const inner = sections.map((s) => s.html).join("\n");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${inner}</body></html>`;

  // html-to-docx es CommonJS → import dinámico. Márgenes de 1" (1440 twips).
  const { default: HTMLtoDOCX } = await import("html-to-docx");
  const out = await HTMLtoDOCX(html, undefined, {
    orientation: "portrait",
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
  });
  const bytes =
    out instanceof ArrayBuffer
      ? new Uint8Array(out)
      : out instanceof Blob
        ? new Uint8Array(await out.arrayBuffer())
        : new Uint8Array(out as Buffer);

  const filename = (landing.name || "documento").replace(/[^a-zA-Z0-9_\-. ]/g, "_") + ".docx";
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
