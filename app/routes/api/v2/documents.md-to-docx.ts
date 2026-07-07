/**
 * POST /api/v2/documents/md-to-docx
 * Auth: owner (OAuth bearer / platform key via authenticateRequest).
 * Body: { markdown: string, title?: string }
 *
 * Compila markdown → .docx editable y lo sube al bucket público → devuelve {fileUrl}.
 * Es el "commit" del streaming en vivo del artefacto (OLA 2): el agente redacta el doc
 * como markdown (streameado token a token al panel draft de GTeams) y NO llama a un
 * skill de docx; al terminar, la plataforma compila ESE markdown a un .docx fiel con
 * una sola generación. md → HTML (marked) → DOCX (html-to-docx).
 */
import type { Route } from "./+types/documents.md-to-docx";
import { marked } from "marked";
import HTMLtoDOCX from "html-to-docx";
import { nanoid } from "nanoid";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getPlatformPublicClient, buildPublicAssetUrl } from "~/.server/storage";

const DOCX_CT =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return bad("method not allowed", 405);
  const ctx = requireAuth(await authenticateRequest(request));

  let body: { markdown?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return bad("bad body");
  }
  const markdown = (body.markdown || "").trim();
  if (!markdown) return bad("markdown requerido");
  const title = (body.title || "Documento").trim().slice(0, 120);

  let buffer: Buffer;
  try {
    const html = await marked.parse(markdown);
    // html-to-docx: (htmlString, headerHTMLString, options, footerHTMLString)
    const out = await HTMLtoDOCX(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${html}</body></html>`,
      null,
      { table: { row: { cantSplit: true } }, footer: false, pageNumber: false }
    );
    // Devuelve Buffer (Node) o ArrayBuffer/Blob según entorno — normaliza a Buffer.
    if (Buffer.isBuffer(out)) buffer = out;
    else if (out instanceof ArrayBuffer) buffer = Buffer.from(out);
    else buffer = Buffer.from(await (out as Blob).arrayBuffer());
  } catch (e) {
    return bad(`md→docx falló: ${e instanceof Error ? e.message : e}`, 500);
  }

  const storageKey = `${ctx.user.id}/${nanoid(10)}.docx`;
  try {
    await getPlatformPublicClient().putObject(storageKey, buffer, DOCX_CT);
  } catch (e) {
    return bad(`upload falló: ${e instanceof Error ? e.message : e}`, 502);
  }
  const fileUrl = buildPublicAssetUrl(storageKey);

  return new Response(JSON.stringify({ ok: true, fileUrl, title }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
