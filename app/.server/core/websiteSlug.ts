/**
 * Reglas del slug de un Website (`/s/<slug>/` y `<slug>.easybits.cloud`).
 *
 * Puro, sin DB: lo usan createWebsite/updateWebsite y los tests. La unicidad
 * (entre sitios no borrados) se revisa aparte, contra la base.
 */

export const SLUG_MIN = 3;
export const SLUG_MAX = 60;

/**
 * Slugs que no se pueden tomar: rutas de la app, subdominios de infraestructura
 * y nombres que se prestan a suplantar a la plataforma.
 */
export const RESERVED_WEBSITE_SLUGS = new Set<string>([
  "api", "admin", "s", "www", "app", "apps", "assets", "static", "public", "cdn",
  "dashboard", "dash", "login", "logout", "signin", "signup", "register", "auth",
  "oauth", "sso", "account", "accounts", "settings", "billing", "checkout", "pay",
  "docs", "doc", "blog", "help", "support", "status", "health", "mcp", "sdk", "cli",
  "mail", "email", "smtp", "imap", "pop", "ftp", "ns", "ns1", "ns2", "dns", "mx",
  "webhook", "webhooks", "internal", "system", "root", "null", "undefined",
  "easybits", "easybit", "ghosty", "staging", "preview", "dev", "test",
]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SlugCheck = { ok: true; slug: string } | { ok: false; reason: string };

/**
 * Normaliza (trim + minúsculas) y valida. Devuelve el slug normalizado o la razón.
 * Reglas: a-z0-9 y guiones, 3–60 chars, sin guion al inicio/fin ni doble guion,
 * no reservado.
 */
export function checkWebsiteSlug(input: unknown): SlugCheck {
  if (typeof input !== "string") return { ok: false, reason: "slug must be a string" };
  const slug = input.trim().toLowerCase();
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) {
    return { ok: false, reason: `slug must be ${SLUG_MIN}-${SLUG_MAX} characters` };
  }
  if (!SLUG_RE.test(slug)) {
    return {
      ok: false,
      reason: "slug may only contain a-z, 0-9 and single hyphens, and cannot start or end with a hyphen",
    };
  }
  if (RESERVED_WEBSITE_SLUGS.has(slug)) return { ok: false, reason: `slug "${slug}" is reserved` };
  return { ok: true, slug };
}

/** Respuesta JSON de error con el contrato público (`slug_invalid` / `slug_taken`). */
export function slugError(error: "slug_invalid" | "slug_taken", message: string): Response {
  return new Response(JSON.stringify({ error, message }), {
    status: error === "slug_taken" ? 409 : 400,
    headers: { "Content-Type": "application/json" },
  });
}

/** Cuántos slugs anteriores se recuerdan por sitio para redirigir con 301. */
export const MAX_PREVIOUS_SLUGS = 10;
