/**
 * POST /api/v2/share/documents/:token/section
 * Body: { sectionId: string, html: string }
 *
 * Persists a section HTML edit made by an invitee with `edit` permission. Validates the
 * share token, ensures it points to the document being edited, then writes the section
 * back as the owner.
 */
import type { Route } from "./+types/share.documents.$token.section";
import { db } from "~/.server/db";
import { verifyShareToken, type SharePermission } from "~/.server/shareLinks";
import type { Section3 } from "~/lib/landing3/types";

const MAX_HTML_BYTES = 256 * 1024; // 256 KB per section is plenty; rejects pathological payloads

// Mongo write-conflict (P2034) retry with backoff. The owner editing in the dash and a guest
// editing via this endpoint write to the same landing doc; a transient conflict here would
// otherwise surface as a 500 and silently drop the guest's edit until they edit again.
async function withRetry<T>(fn: () => Promise<T>, retries = 5): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err?.code === "P2034" && i < retries - 1) {
        await new Promise((r) => setTimeout(r, 50 * 2 ** i + Math.random() * 100));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unreachable");
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const token = params.token;
  if (!token) return Response.json({ error: "Missing token" }, { status: 400 });

  const result = await verifyShareToken(token);
  if (!result.ok) return Response.json({ error: result.reason }, { status: 401 });

  const permission = result.payload.perm as SharePermission;
  if (permission !== "edit") {
    return Response.json({ error: "Edit permission required" }, { status: 403 });
  }
  if (result.link.resourceType !== "document") {
    return Response.json({ error: "Resource is not a document" }, { status: 400 });
  }

  let body: { sectionId?: string; html?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sectionId = typeof body.sectionId === "string" ? body.sectionId : null;
  const html = typeof body.html === "string" ? body.html : null;
  if (!sectionId || html === null) {
    return Response.json({ error: "sectionId and html are required" }, { status: 400 });
  }
  if (html.length > MAX_HTML_BYTES) {
    return Response.json({ error: "Section HTML too large" }, { status: 413 });
  }

  const landing = await db.landing.findUnique({ where: { id: result.link.resourceId } });
  if (!landing || landing.version !== 4) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }
  if (landing.ownerId !== result.link.ownerId) {
    return Response.json({ error: "Resource ownership mismatch" }, { status: 403 });
  }

  const sections = ((landing.sections as unknown) as Section3[]) || [];
  const idx = sections.findIndex((s) => s.id === sectionId);
  if (idx === -1) {
    return Response.json({ error: "Section not found" }, { status: 404 });
  }

  const updated: Section3[] = sections.map((s, i) => (i === idx ? { ...s, html } : s));

  await withRetry(() =>
    db.landing.update({
      where: { id: landing.id },
      data: { sections: updated as any },
    })
  );

  return Response.json({ ok: true });
}
