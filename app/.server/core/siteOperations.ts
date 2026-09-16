// Creador de sitios (/dash/sitios): UNA superficie (chat + preview + publicar) y dos
// productos. `static` = HTML plano en un Website (CDN, incluido en el plan).
// `webapp` = código en una caja permanente (cobra la máquina, launch_app).
//
// El que construye es un FleetAgent "builder" por cuenta (claude-worker con los
// buckets sitios+sandbox+hosting). No hay loop de coding propio: el chat del
// dashboard entra a routeMessage con groupId `site:<id>` y un appendSystemPrompt
// por turno que le dice al agente QUÉ sitio está tocando y cómo.
import { db } from "~/.server/db";
import type { AuthContext } from "~/.server/apiAuth";
import { requireScope } from "~/.server/apiAuth";
import { createFleetAgent, recycleFleetAgentBoxes } from "./fleetAgentOperations";
import { checkLLMTokenLimit, recargarLLMTokens } from "~/.server/llmTokenLimit";
import { createWebsite } from "./operations";
import { buyMachine } from "./machineOperations";
import { launchApp, setRunspec } from "./releaseOperations";
import { exposeSandboxPort } from "./sandboxOperations";

export const BUILDER_NAME = "Sitios Builder";
// Motor del builder: `easybits` = ghosty-gc contra el proxy medido (/api/v2/llm/v1),
// que YA descuenta del bucket de tokens LLM del dueño y responde 402 sin saldo. Con
// claude-worker (OAuth Max de la casa) el usuario construía gratis.
const BUILDER_ENGINE = "easybits";
const BUILDER_TEMPLATE = "ghosty-gc";
// Regalo de arranque: una cuenta SIN saldo (Byte post-promo) recibe tokens al crear
// su primer sitio, una sola vez por cuenta (sello en metadata.sitesStarterGrantAt).
export const SITES_STARTER_TOKENS = 500_000;
const DEFAULT_RUNSPEC = { appDir: "/app", buildCommand: "(npm ci || npm install) && npm run build --if-present", startCommand: "npm start", port: 3000 };
export type SiteKind = "static" | "webapp";

const BUILDER_SYSTEM = [
  "Eres el constructor de sitios de EasyBits. Construyes sitios web y web apps por encargo, dentro del sitio que te indica cada turno (sección SITIO ACTUAL).",
  "Trabajas SOLO con las herramientas: nunca describas código que no escribiste ni digas que publicaste sin haber llamado la tool.",
  "Estilo: Tailwind (CDN en static), diseño limpio y con carácter, copy en el idioma del usuario. Nada de lorem ipsum: inventa contenido creíble para el negocio descrito.",
  "Responde corto: qué hiciste y qué falta. La vista previa se refresca sola al terminar tu turno.",
].join("\n");

function siteGroupId(siteId: string) {
  return `site:${siteId}`;
}

/** El builder de la cuenta; se crea al primer sitio (lazy, uno por dueño). */
export async function ensureBuilderAgent(ctx: AuthContext) {
  const existing = await db.fleetAgent.findFirst({
    where: { ownerId: ctx.user.id, name: BUILDER_NAME },
    select: { id: true, token: true, workerTemplate: true, persona: true },
  });
  if (existing) {
    // Builder nacido antes del motor medido (claude-worker): se migra en sitio y se
    // recicla su caja (el env es spawn-baked; la VM viva seguiría con el motor viejo).
    if (existing.workerTemplate !== BUILDER_TEMPLATE) {
      const persona = (existing.persona as { env?: Record<string, string> } | null) ?? {};
      await db.fleetAgent.update({
        where: { id: existing.id },
        data: {
          workerTemplate: BUILDER_TEMPLATE,
          persona: { ...persona, env: { ...(persona.env ?? {}), GHOSTY_LLM: BUILDER_ENGINE } },
        },
      });
      await recycleFleetAgentBoxes({ id: existing.id, ownerId: ctx.user.id }).catch(() => {});
    }
    return { id: existing.id, token: existing.token };
  }
  const created = await createFleetAgent(ctx, {
    name: BUILDER_NAME,
    systemPrompt: BUILDER_SYSTEM,
    engine: BUILDER_ENGINE,
    // Buckets: sitios (Website + Files), sandbox (archivos/exec en la caja) y
    // hosting (launch_app/restart_machine). Sin lo demás: es un constructor.
    env: { EASYBITS_TOOL_GROUP: "scripting,sitios,sandbox,hosting" },
    idleSuspendMin: 2,
  });
  return { id: created.id, token: created.token };
}

/** Regalo de arranque para cuentas sin saldo, una vez por cuenta. Devuelve si se otorgó. */
export async function grantStarterTokensIfNeeded(userId: string): Promise<boolean> {
  const lim = await checkLLMTokenLimit(userId);
  if (lim.remaining > 0) return false;
  // El sello es la propia fila de auditoría (User.metadata es un tipo compuesto
  // cerrado en Prisma; no admite campos nuevos sin migración).
  const already = await db.aiGenerationLog.findFirst({ where: { userId, type: "sites.starter_grant" }, select: { id: true } });
  if (already) return false;
  await db.aiGenerationLog.create({
    data: { userId, type: "sites.starter_grant", product: "compute", cost: 1, outputTokens: SITES_STARTER_TOKENS },
  });
  await recargarLLMTokens(userId, SITES_STARTER_TOKENS);
  return true;
}

// Prisma+Mongo: un campo AUSENTE (fila creada sin `deletedAt`) NO matchea `null`.
const NOT_DELETED = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

export async function listSites(ctx: AuthContext) {
  requireScope(ctx, "READ");
  const rows = await db.site.findMany({
    where: { ownerId: ctx.user.id, ...NOT_DELETED },
    orderBy: { createdAt: "desc" },
  });
  const websites = await db.website.findMany({
    where: { id: { in: rows.map((r) => r.websiteId).filter(Boolean) as string[] } },
    select: { id: true, slug: true, subdomainEnabled: true },
  });
  const bySite = Object.fromEntries(websites.map((w) => [w.id, w]));
  return rows.map((r) => ({ ...r, url: publicUrl(r, r.websiteId ? bySite[r.websiteId] : null) }));
}

export async function getSite(ctx: AuthContext, id: string) {
  requireScope(ctx, "READ");
  const site = await db.site.findFirst({ where: { id, ownerId: ctx.user.id, ...NOT_DELETED } });
  if (!site) throw new Response("Site not found", { status: 404 });
  const website = site.websiteId
    ? await db.website.findUnique({ where: { id: site.websiteId }, select: { id: true, slug: true, subdomainEnabled: true } })
    : null;
  const sandbox = site.sandboxId
    ? await db.sandbox.findUnique({ where: { sandboxId: site.sandboxId }, select: { status: true, runspec: true, currentReleaseId: true } })
    : null;
  return { ...site, website, sandbox, url: publicUrl(site, website), previewUrl: previewUrl(site, website, sandbox) };
}

type Row = { kind: string; sandboxId: string | null };
type Web = { slug: string; subdomainEnabled: boolean } | null;

/** URL pública del sitio (lo que se comparte). */
function publicUrl(site: Row, website: Web) {
  if (site.kind === "static" && website) {
    return website.subdomainEnabled
      ? `https://${website.slug}.easybits.cloud`
      : `https://www.easybits.cloud/s/${website.slug}/`;
  }
  if (site.kind === "webapp" && site.sandboxId) return sandboxUrl(site.sandboxId, 3000);
  return null;
}

/** URL para el iframe. Static va por `/s/<slug>/` (mismo origen → el picker habla
 * por postMessage sin CORS); webapp es la caja por su puerto. */
function previewUrl(site: Row, website: Web, sandbox: { runspec: unknown } | null) {
  if (site.kind === "static" && website) return `/s/${website.slug}/`;
  if (site.kind === "webapp" && site.sandboxId) {
    const port = (sandbox?.runspec as { port?: number } | null)?.port ?? 3000;
    return sandboxUrl(site.sandboxId, port);
  }
  return null;
}

function sandboxUrl(sandboxId: string, port: number) {
  // Misma dirección que publica el host (ver dash/hosting.tsx loader).
  return `https://sb-${sandboxId.replace(/^sb_/, "")}-${port}.sandboxes.easybits.cloud`;
}

/**
 * Crea el sitio y su destino. Static: el Website nace aquí para que el agente reciba
 * un websiteId real y no invente uno. Webapp: compra la máquina (micro); sin plan
 * devuelve `checkoutUrl` y el sitio queda sin caja hasta que el dueño la vincule.
 */
export async function createSite(
  ctx: AuthContext,
  opts: { kind: SiteKind; name: string; tier?: string }
): Promise<{ site: { id: string }; checkoutUrl?: string }> {
  requireScope(ctx, "WRITE");
  const name = opts.name.trim() || "Mi sitio";
  await ensureBuilderAgent(ctx);
  await grantStarterTokensIfNeeded(ctx.user.id).catch(() => {});
  if (opts.kind === "static") {
    const website = await createWebsite(ctx, { name });
    const site = await db.site.create({
      data: { ownerId: ctx.user.id, kind: "static", name, websiteId: website.id },
    });
    return { site };
  }
  const bought = await buyMachine(ctx, { tier: opts.tier ?? "micro", template: "node", name });
  const sandboxId = "machine" in bought && bought.machine ? bought.machine.sandboxId : null;
  const site = await db.site.create({
    data: { ownerId: ctx.user.id, kind: "webapp", name, sandboxId },
  });
  // Runspec por default desde el día cero: sin él `restart_machine` falla y el
  // agente pierde un turno descubriéndolo (pasó en la primera prueba).
  if (sandboxId) {
    await setRunspec(ctx, sandboxId, DEFAULT_RUNSPEC).catch(() => {});
    // El puerto se expone desde ya: la vista previa es la URL pública de la caja y
    // `restart_machine` no expone nada (solo launch_app lo hacía).
    await exposeSandboxPort(ctx, sandboxId, DEFAULT_RUNSPEC.port).catch(() => {});
  }
  return { site, checkoutUrl: "checkoutUrl" in bought ? bought.checkoutUrl : undefined };
}

/** Tras el checkout, engancha al sitio la máquina más reciente que no tenga sitio. */
export async function attachNewestMachine(ctx: AuthContext, siteId: string) {
  requireScope(ctx, "WRITE");
  const site = await getSite(ctx, siteId);
  if (site.sandboxId) return site;
  const taken = (await db.site.findMany({ where: { ownerId: ctx.user.id, sandboxId: { isSet: true } }, select: { sandboxId: true } }))
    .map((s) => s.sandboxId as string);
  const box = await db.sandbox.findFirst({
    where: { ownerId: ctx.user.id, persistent: true, status: { notIn: ["destroyed", "pending_deletion"] }, sandboxId: { notIn: taken } },
    orderBy: { createdAt: "desc" },
  });
  if (!box) return site;
  await db.site.update({ where: { id: siteId }, data: { sandboxId: box.sandboxId } });
  return getSite(ctx, siteId);
}

/** Publicar una webapp = launch_app sobre su caja (build + URL + release). */
export async function publishSite(ctx: AuthContext, siteId: string) {
  const site = await getSite(ctx, siteId);
  if (site.kind !== "webapp" || !site.sandboxId) throw new Response("Nothing to publish", { status: 400 });
  return launchApp(ctx, { sandboxId: site.sandboxId, message: "Publicado desde /dash/sitios" });
}

export async function deleteSite(ctx: AuthContext, siteId: string) {
  requireScope(ctx, "DELETE");
  await getSite(ctx, siteId);
  // Soft-delete: el Website/caja siguen vivos (nunca borramos datos del usuario).
  await db.site.update({ where: { id: siteId }, data: { deletedAt: new Date() } });
}

/** Contexto por turno: qué sitio es y cómo tocarlo. Se appendea (capa 3), no pisa. */
export function siteTurnPrompt(site: Awaited<ReturnType<typeof getSite>>, selection?: { id: string; tag: string } | null) {
  const lines = [`SITIO ACTUAL: "${site.name}" (${site.kind}).`];
  if (site.kind === "static" && site.website) {
    lines.push(
      `Es un sitio ESTÁTICO: websiteId="${site.website.id}", slug="${site.website.slug}".`,
      `Escribe/actualiza el HTML con deploy_website_file({ websiteId, fileName: "index.html", contentType: "text/html", content }). Assets extra (css/js/img) con el mismo tool y su fileName. Para leer lo que ya hay: list_website_files + get_file.`,
      `Reglas del HTML: documento completo con <script src="https://cdn.tailwindcss.com"></script>, responsive, y CADA sección/elemento de bloque (header, section, article, footer, nav, form, cada card) lleva un atributo data-eb-id ÚNICO y estable (ej. data-eb-id="hero", "precios-card-2"). Conserva los data-eb-id existentes al editar; cambia SOLO lo que se pide.`,
      `No crees otro website: usa SIEMPRE ese websiteId.`
    );
  } else if (site.kind === "webapp" && site.sandboxId) {
    lines.push(
      `Es una WEB APP en su propia máquina: sandboxId="${site.sandboxId}". El código vive en /app.`,
      `Escribe archivos con sandbox_files_write y corre comandos con sandbox_exec (npm install, etc.). Stack por default: Node con un servidor en el puerto 3000 (Express/Hono/RRv7 según pida), package.json con scripts build y start.`,
      `Para que la vista previa refleje cambios: tras editar, llama restart_machine({ sandboxId }). Para PUBLICAR (build + release versionado) llama launch_app({ sandboxId }) — solo cuando el usuario lo pida o al terminar la primera versión.`,
      `No crees máquinas nuevas ni uses otro sandboxId.`
    );
  } else if (site.kind === "webapp") {
    lines.push("La máquina de esta web app aún no existe (pago pendiente). Explica al usuario que complete el pago desde el panel; NO crees una máquina.");
  }
  if (selection) {
    lines.push(`ELEMENTO SELECCIONADO por el usuario en la vista previa: <${selection.tag} data-eb-id="${selection.id}">. Su petición se refiere a ese elemento; modifica solo ese nodo salvo que pida otra cosa.`);
  }
  return lines.join("\n");
}

export { siteGroupId };
