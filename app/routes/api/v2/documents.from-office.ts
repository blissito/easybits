/**
 * POST /api/v2/documents/from-office
 * Auth: owner (OAuth bearer / platform key via authenticateRequest).
 * Body: { url: string, name?: string }
 *
 * Convierte un archivo de office (.docx) en un DOCUMENTO EDITABLE (Landing v4) para
 * poder co-editarlo en el room. docx → HTML (mammoth, sin LibreOffice) → una sección
 * de prosa `data-doc-flow` (misma que el editor colab: paginación en flujo + export
 * PDF/DOCX). El formato visual bonito del .docx original se conserva en la descarga y
 * en el preview; esta versión editable es simplificada (contenido + estructura). GTeams
 * llama esto desde el botón "Editar" del artefacto office, luego mintea el editor.
 */
import type { Route } from "./+types/documents.from-office";
import mammoth from "mammoth";
import { nanoid } from "nanoid";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { createDocument } from "~/.server/core/documentOperations";

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Envuelve el HTML importado como sección de PROSA que fluye (igual que wrapAsPage del
// editor colab) → paginación natural en PDF + editable en BlockNote.
function wrapAsFlowPage(innerHtml: string): string {
  return `<section data-doc-flow="1" class="w-[8.5in] min-h-[11in] p-16 bg-surface text-on-surface leading-relaxed">${innerHtml}</section>`;
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return bad("method not allowed", 405);
  const ctx = requireAuth(await authenticateRequest(request));

  let body: { url?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return bad("bad body");
  }
  const url = (body.url || "").trim();
  if (!url || !/^https?:\/\//.test(url)) return bad("url (http/https del archivo) requerida");

  // Descarga el archivo office.
  let buffer: Buffer;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return bad(`no se pudo descargar el archivo (${res.status})`, 502);
    buffer = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    return bad(`descarga falló: ${e instanceof Error ? e.message : e}`, 502);
  }

  // docx → HTML. mammoth solo soporta .docx (no xlsx/pptx) — para esos, el import no
  // aplica (se quedan en preview/descarga).
  let html: string;
  try {
    const result = await mammoth.convertToHtml({ buffer });
    html = (result.value || "").trim();
    if (!html) return bad("el documento no produjo contenido editable (¿es un .docx válido?)", 422);
  } catch (e) {
    return bad(`conversión docx→html falló (solo .docx soportado): ${e instanceof Error ? e.message : e}`, 422);
  }

  const name = (body.name || "Documento").trim().slice(0, 120);
  const doc = await createDocument(ctx, {
    name,
    sections: [{ id: nanoid(12), order: 0, html: wrapAsFlowPage(html), type: "imported", name: "Imported" }],
  });

  return new Response(JSON.stringify({ ok: true, documentId: doc.id, title: doc.name }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
