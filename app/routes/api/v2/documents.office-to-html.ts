/**
 * POST /api/v2/documents/office-to-html
 * Auth: owner (OAuth bearer / platform key via authenticateRequest).
 * Body: { url: string }
 *
 * Preview PRIVADO de un .docx: descarga el archivo y lo convierte a HTML con mammoth
 * (sin LibreOffice, sin Microsoft). Devuelve el HTML crudo — NO crea un Documento
 * (a diferencia de documents.from-office, que sí crea un Landing v4 editable). GTeams
 * lo renderiza inline en el panel del artefacto → visor propio, sin CORS, sin mandar
 * la URL del doc a terceros. Solo .docx (mammoth no soporta xlsx/pptx).
 */
import type { Route } from "./+types/documents.office-to-html";
import mammoth from "mammoth";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return bad("method not allowed", 405);
  requireAuth(await authenticateRequest(request));

  let body: { url?: string };
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

  // docx → HTML. mammoth solo soporta .docx.
  let html: string;
  try {
    const result = await mammoth.convertToHtml({ buffer });
    html = (result.value || "").trim();
    if (!html) return bad("el documento no produjo contenido (¿es un .docx válido?)", 422);
  } catch (e) {
    return bad(`conversión docx→html falló (solo .docx): ${e instanceof Error ? e.message : e}`, 422);
  }

  return new Response(JSON.stringify({ ok: true, html }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
