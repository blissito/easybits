import type { Route } from "./+types/sites-collection";
import { authenticateRequest, requireAuth, type AuthContext } from "~/.server/apiAuth";
import { getUserOrNull } from "~/.server/getters";
import { createSite, engineChoicesFor, getSite, listSiteSummaries } from "~/.server/core/siteOperations";
import { DEFAULT_SITE_ENGINE } from "~/lib/fleetEngines";
import { isSiteStack } from "~/lib/siteStacks";
import { isSiteTemplate, stackHasTemplates, templateFor } from "~/lib/siteTemplates";
import { paginate } from "~/.server/mcp/responses";

// GET /api/v2/sites — los sitios de /dash/sitios (estáticos y web apps, con su motor).
// Ruta de recurso: sólo loader, sin export default (si no, sirve el shell de la SPA).
// También con la sesión del navegador: el hero de la home ofrece «Continuar» el último sitio.
export async function loader({ request }: Route.LoaderArgs) {
  let auth = await authenticateRequest(request);
  if (!auth) {
    const user = await getUserOrNull(request).catch(() => null);
    if (user) auth = { user, scopes: ["READ"] } as AuthContext;
  }
  const ctx = requireAuth(auth);
  const items = await listSiteSummaries(ctx);
  return Response.json(paginate(items, { total: items.length }));
}

// POST /api/v2/sites {prompt?, name?, kind?, stack?, template?, engine?, model?, secretValue?} — crea un sitio. Por default
// es una web app TanStack en su propia caja, nacida de la caja dorada con la plantilla que
// corresponde al prompt (construir es gratis; se cobra al publicar). kind "static" = sitio CDN.
// Acepta API key o la sesión del navegador: el hero de la home lo crea sin salir de la página.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  let ctx = await authenticateRequest(request);
  if (!ctx) {
    const user = await getUserOrNull(request).catch(() => null);
    if (user) ctx = { user, scopes: ["READ", "WRITE"] } as AuthContext;
  }
  ctx = requireAuth(ctx);
  const body = (await request.json().catch(() => ({}))) as { name?: string; prompt?: string; kind?: string; stack?: string; template?: string; engine?: string; model?: string; secretValue?: string };
  const prompt = String(body.prompt ?? "").trim();
  const name = String(body.name ?? "").trim() || nameFromPrompt(prompt);
  // El motor que pidieron (pastilla del home, SDK, CLI); si no, el default de /dash/sitios/new:
  // Claude si ya tiene su llave, si no el medido.
  const engines = await engineChoicesFor(ctx.user.id);
  const engine =
    typeof body.engine === "string" && body.engine ? body.engine : engines.some((e) => e.id === "claude" && e.creatable && !e.needsSecret) ? "claude" : DEFAULT_SITE_ENGINE;
  const model = typeof body.model === "string" && body.model ? body.model : null;
  try {
    const kind = body.kind === "static" ? "static" : "webapp";
    const stack = kind === "webapp" ? (isSiteStack(body.stack) ? body.stack : "tanstack") : null;
    const template = stackHasTemplates(stack) ? (isSiteTemplate(body.template) ? body.template : templateFor(prompt)) : null;
    const { site } = await createSite(ctx, { kind, name, engine, model, secretValue: body.secretValue, stack, template, sleep: true });
    const full = await getSite(ctx, site.id);
    return Response.json(
      { id: site.id, name, kind, stack, template, previewUrl: full.previewUrl, url: full.url, editorUrl: `/dash/sitios/${site.id}` },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof Response) {
      const message = await e.text().catch(() => e.statusText);
      return Response.json({ error: message }, { status: e.status });
    }
    throw e;
  }
}

/** Nombre corto a partir del prompt: las primeras palabras, sin puntuación. */
function nameFromPrompt(prompt: string) {
  const words = prompt.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 5);
  return words.length ? words.join(" ").slice(0, 40) : "Mi sitio";
}
