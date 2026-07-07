/**
 * POST /api/v2/documents/collab-embed-link
 * Auth: owner (OAuth bearer / platform key via authenticateRequest).
 * Body: { slug?: string, documentId?: string, origin: string }
 *
 * Mints an EDIT share link for a document and returns the EMBEDDABLE collaborative
 * editor URL (/collab/document/:token?embed=1, allowedOrigins=[origin]). GTeams
 * calls this when @ghosty produces a document, then opens the returned URL as an
 * artifact in the room panel (live co-editing, embedded via iframe).
 */
import type { Route } from "./+types/documents.collab-embed-link";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { createShareLink } from "~/.server/shareLinks";

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return bad("method not allowed", 405);
  const ctx = requireAuth(await authenticateRequest(request));
  const ownerId = ctx.user.id;

  let body: { slug?: string; documentId?: string; origin?: string };
  try {
    body = await request.json();
  } catch {
    return bad("bad body");
  }
  const origin = (body.origin || "").trim();
  if (!origin) return bad("origin required (para el CSP frame-ancestors del embed)");

  // Resolver documentId: directo, o vía slug → Website → Landing v4 del owner.
  let documentId = body.documentId;
  if (!documentId && body.slug) {
    const website = await db.website.findFirst({
      where: { ownerId, slug: body.slug },
      select: { id: true },
    });
    if (website) {
      const landing = await db.landing.findFirst({
        where: { websiteId: website.id, ownerId, version: 4 },
        select: { id: true },
      });
      documentId = landing?.id;
    }
  }
  if (!documentId) return bad("document no encontrado (pasa documentId o slug válido)", 404);

  const landing = await db.landing.findFirst({
    where: { id: documentId, ownerId, version: 4 },
    select: { id: true, name: true },
  });
  if (!landing) return bad("document no encontrado o no es v4", 404);

  // Embed edit link (allowedOrigins → modo embed, expiry hasta 1 año).
  const { token } = await createShareLink({
    resourceType: "document",
    resourceId: landing.id,
    permission: "edit",
    ownerId,
    allowedOrigins: [origin],
    source: "sdk",
    expiresIn: 365 * 24 * 3600,
  });

  const base = new URL(request.url).origin;
  return new Response(
    JSON.stringify({
      ok: true,
      documentId: landing.id,
      title: landing.name,
      embedUrl: `${base}/collab/document/${token}?embed=1`,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
