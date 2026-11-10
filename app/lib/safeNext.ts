// Normaliza el `next` del login a una ruta de DOCUMENTO interna.
// Una navegación del cliente sin sesión pide `/dash.data` (single fetch) y
// `getUserOrRedirect` guardaba ese pathname tal cual: el magic link llevaba
// `next=/dash.data` y al abrirlo el navegador mostraba el turbo-stream crudo
// (`[["SingleFetchRedirect",1],…]`). Caso real: 10-nov-2026.
export function toDocumentPath(
  raw: string | null | undefined,
  fallback = "/dash"
): string {
  if (!raw || typeof raw !== "string") return fallback;
  // Sólo rutas internas: nada de `//evil.com` ni URLs absolutas.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\"))
    return fallback;
  let url: URL;
  try {
    url = new URL(raw, "http://x");
  } catch {
    return fallback;
  }
  let path = url.pathname;
  if (path === "/_root.data") path = "/";
  else if (path.endsWith("/_.data")) path = path.slice(0, -"_.data".length);
  else if (path.endsWith(".data")) path = path.slice(0, -".data".length);
  url.searchParams.delete("_routes");
  const search = url.searchParams.toString();
  return (path || "/") + (search ? `?${search}` : "") + url.hash;
}
