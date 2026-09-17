// Negociación `Accept: text/markdown`: la página /docs pedida con ese Accept (con q ≥ que
// text/html) devuelve el markdown EN LA MISMA URL. Va en entry.server y no en el loader de
// la ruta UI: un Response lanzado desde ahí acaba en el ErrorBoundary como HTML.
import { getDocsMarkdown } from "./reference";
import { resolveDocsSection } from "./sectionAlias";

function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  const q = (type: string) => {
    const m = accept.split(",").map((p) => p.trim()).find((p) => p.startsWith(type));
    if (!m) return 0;
    const qv = m.match(/;\s*q=([0-9.]+)/);
    return qv ? parseFloat(qv[1]) : 1;
  };
  const md = q("text/markdown");
  return md > 0 && md >= q("text/html");
}

export async function markdownForRequest(request: Request): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (!prefersMarkdown(request.headers.get("accept"))) return null;
  const { pathname } = new URL(request.url);
  const locale = pathname.startsWith("/en/") ? "en" : "es";
  const path = pathname.replace(/^\/en/, "");
  let body: string | null = null;
  if (path === "/docs") body = await getDocsMarkdown(undefined, locale);
  else {
    const m = path.match(/^\/docs\/([a-z0-9-]+)$/i);
    const key = m ? resolveDocsSection(m[1]) : null;
    if (key) body = await getDocsMarkdown(key, locale);
  }
  if (body === null) return null;
  return new Response(request.method === "HEAD" ? null : body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      Vary: "Accept",
    },
  });
}
