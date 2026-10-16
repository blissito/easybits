// Creador de sitios (/dash/sitios): UNA superficie (chat + preview + publicar) y dos
// productos. `static` = HTML plano en un Website (CDN, incluido en el plan).
// `webapp` = código en una caja permanente (cobra la máquina, launch_app).
//
// El que construye es un FleetAgent "builder" por cuenta (claude-worker con los
// buckets sitios+sandbox+hosting). No hay loop de coding propio: el chat del
// dashboard entra a routeMessage con groupId `site:<id>` y un appendSystemPrompt
// por turno que le dice al agente QUÉ sitio está tocando y cómo.
import crypto from "node:crypto";
import { db } from "~/.server/db";
import type { AuthContext } from "~/.server/apiAuth";
import { requireScope } from "~/.server/apiAuth";
import { createFleetAgent, recycleFleetAgentBoxes } from "./fleetAgentOperations";
import { checkLLMTokenLimit, recargarLLMTokens } from "~/.server/llmTokenLimit";
import { createSecret, getMachineSecretValue, listSecrets } from "./secretOperations";
import { FLEET_ENGINES, DEFAULT_SITE_ENGINE, getEngine, engineCreatable, engineIsMetered, type FleetEngine } from "~/lib/fleetEngines";
import { createWebsite, deployWebsiteFile } from "./operations";
import { createWorkBox, promoteWorkBox, releasePermanent } from "./machineOperations";
import { launchApp, setMachineSecrets, setRunspec } from "./releaseOperations";
import { createDatabase } from "./databaseOperations";
import { SECRETS_FILE, writeSecretsFile } from "./secretsFile";
import { MESH_DB_PASSTHROUGH } from "./sandboxOperations";
import { execCommand, exposeSandboxPort, getSandbox, listFiles, readFile, waitUntilRunning, writeFile } from "./sandboxOperations";
import { DEFAULT_SITE_THEME, SITE_THEMES, parseThemeColors, replaceStaticTheme, themeBlockStatic, themeCssTw4, validThemeColors, type ThemeColors } from "~/lib/siteTheme";
import { PREVIEW_DEPS_MARK, PREVIEW_PORT, PREVIEW_UNIT, STARTER_DIR, stackHasAuth, previewInstallScript, starterFiles, starterPrompt, starterRunspec, stackThemeFiles, themeRule, starterSnapshot, starterTemplate } from "~/.server/starters";
import { isSiteStack, type SiteStackId } from "~/lib/siteStacks";
import { pushSiteToGithub, siteRepo } from "./githubSiteOperations";
import { markSelfPushed } from "./pushDeployOperations";

export const BUILDER_NAME = "Sitios Builder";
// Motor por default: `easybits` = ghosty-gc contra el proxy medido (/api/v2/llm/v1),
// que YA descuenta del bucket de tokens LLM del dueño y responde 402 sin saldo. Los
// demás motores (claude/deepseek/codex) son BYOK: la llave del dueño, del vault.
const BUILDER_TEMPLATE = "ghosty-gc";
// Toolset del MCP de easybits para un builder ghosty-gc (?tools= de su mcp.json).
const BUILDER_TOOLS = "sitios,sandbox,hosting";

/** Motor de un sitio (null → default medido). */
export function siteEngineFor(site: { engine?: string | null }): FleetEngine {
  return getEngine(site.engine ?? DEFAULT_SITE_ENGINE) ?? getEngine(DEFAULT_SITE_ENGINE)!;
}

/** Un builder POR MOTOR por cuenta. El de easybits conserva el nombre original. */
function builderNameFor(engineId: string) {
  return engineId === DEFAULT_SITE_ENGINE ? BUILDER_NAME : `${BUILDER_NAME} · ${engineId}`;
}

/** Para el selector: motores + si su llave ya está en el vault (sin exponer nombres). */
export async function engineChoicesFor(userId: string) {
  const owned = new Set((await listSecrets(userId)).map((s) => s.name));
  return FLEET_ENGINES.map((e) => ({
    id: e.id,
    label: e.label.replace(/^Ghosty · /, ""),
    model: e.model,
    metered: engineIsMetered(e),
    creatable: engineCreatable(e),
    needsSecret: !!e.secret && !owned.has(e.secret.name),
    secretPlaceholder: e.secret?.placeholder ?? "",
    secretKind: e.secret?.kind ?? null,
    models: e.models ?? [],
    defaultModel: e.siteModel ?? e.defaultModel ?? null,
  }));
}
// Regalo de arranque: una cuenta SIN saldo (Byte post-promo) recibe tokens al crear
// su primer sitio, una sola vez por cuenta (sello en metadata.sitesStarterGrantAt).
export const SITES_STARTER_TOKENS = 500_000;
const DEFAULT_RUNSPEC = { appDir: "/app", buildCommand: "(npm ci || npm install) && npm run build --if-present", startCommand: "npm start", port: 3000 };
export type SiteKind = "static" | "webapp";
/** Stack de una webapp: null = Node libre (el agente elige Express/Hono/RRv7). */
export type SiteStack = SiteStackId | null;

function siteStack(site: { stack?: string | null }): SiteStack {
  return isSiteStack(site.stack) ? site.stack : null;
}

const BUILDER_SYSTEM = [
  "Eres el constructor de sitios de EasyBits. Construyes sitios web y web apps por encargo, dentro del sitio que te indica cada turno (sección SITIO ACTUAL).",
  "Trabajas SOLO con las herramientas: nunca describas código que no escribiste ni digas que publicaste sin haber llamado la tool.",
  "Estilo: Tailwind (CDN en static), diseño limpio y con carácter, copy en el idioma del usuario. Nada de lorem ipsum: inventa contenido creíble para el negocio descrito.",
  "Responde corto: qué hiciste y qué falta. La vista previa se refresca sola al terminar tu turno.",
].join("\n");

function siteGroupId(siteId: string) {
  return `site:${siteId}`;
}

/** El builder de la cuenta para un motor; se crea al primer sitio (lazy). */
export async function ensureBuilderAgent(ctx: AuthContext, engineId: string = DEFAULT_SITE_ENGINE, model?: string | null) {
  const engine = getEngine(engineId) ?? getEngine(DEFAULT_SITE_ENGINE)!;
  const existing = await db.fleetAgent.findFirst({
    where: { ownerId: ctx.user.id, name: builderNameFor(engine.id) },
    select: { id: true, token: true, workerTemplate: true, persona: true },
  });
  // `model` = el que eligió el dueño al crear el sitio (sólo si es de la lista del motor).
  const picked = model && engine.models?.some((m) => m.id === model) ? model : null;
  const siteModel = picked ?? engine.siteModel ?? engine.defaultModel;
  if (existing) {
    // Modelo elegido a mano al crear: manda sobre lo que tenga el builder, y se recicla la caja
    // para que el siguiente turno ya corra con él (el env va horneado al crear la caja).
    if (picked && engine.modelEnv) {
      const persona = (existing.persona as { env?: Record<string, string>; siteModelPicked?: boolean } | null) ?? {};
      if (persona.env?.[engine.modelEnv] !== picked) {
        await db.fleetAgent.update({
          where: { id: existing.id },
          data: { persona: { ...persona, siteModelPicked: true, env: { ...(persona.env ?? {}), [engine.modelEnv]: picked } } },
        });
        await recycleFleetAgentBoxes({ id: existing.id, ownerId: ctx.user.id }).catch(() => {});
      }
      return { id: existing.id, token: existing.token };
    }
    // Builder con el modelo viejo (el default del motor o ninguno): se sube al de sitios. El env
    // se refresca solo al despertar la caja (spawnEnvHash), sin reciclarla. Uno que el dueño
    // cambió a mano a otro modelo se respeta.
    if (engine.modelEnv && siteModel) {
      const persona = (existing.persona as { env?: Record<string, string>; siteModelPicked?: boolean } | null) ?? {};
      const cur = persona.env?.[engine.modelEnv];
      // Uno que el dueño eligió (al crear un sitio) nunca se sube solo.
      if (!persona.siteModelPicked && cur !== siteModel && (!cur || cur === engine.defaultModel)) {
        await db.fleetAgent.update({
          where: { id: existing.id },
          data: { persona: { ...persona, env: { ...(persona.env ?? {}), [engine.modelEnv]: siteModel } } },
        });
      }
    }
    // Builder ghosty-gc sin toolset propio: su arranque arma el MCP con EASYBITS_TOOLS
    // (default `ghosty` = docs/db/imágenes), NO con EASYBITS_TOOL_GROUP → no veía
    // deploy_website_file ni sandbox_*, gastaba el turno buscándolas y se cortaba a los
    // 120 s sin responder (14-oct). El mcp.json se escribe en /data al nacer: hay que
    // reciclar la caja (el hash del artifact ya incluye EASYBITS_TOOLS).
    if (existing.workerTemplate === BUILDER_TEMPLATE) {
      const persona = (existing.persona as { env?: Record<string, string> } | null) ?? {};
      if (persona.env?.EASYBITS_TOOLS !== BUILDER_TOOLS) {
        await db.fleetAgent.update({
          where: { id: existing.id },
          data: { persona: { ...persona, env: { ...(persona.env ?? {}), EASYBITS_TOOLS: BUILDER_TOOLS } } },
        });
        await recycleFleetAgentBoxes({ id: existing.id, ownerId: ctx.user.id }).catch(() => {});
      }
    }
    // Builder easybits nacido antes del motor medido (claude-worker): se migra en sitio
    // y se recicla su caja (el env es spawn-baked; la VM viva seguiría con el motor viejo).
    if (engine.id === DEFAULT_SITE_ENGINE && existing.workerTemplate !== BUILDER_TEMPLATE) {
      const persona = (existing.persona as { env?: Record<string, string>; siteModelPicked?: boolean } | null) ?? {};
      await db.fleetAgent.update({
        where: { id: existing.id },
        data: {
          workerTemplate: BUILDER_TEMPLATE,
          persona: { ...persona, env: { ...(persona.env ?? {}), GHOSTY_LLM: DEFAULT_SITE_ENGINE, EASYBITS_TOOLS: BUILDER_TOOLS } },
        },
      });
      await recycleFleetAgentBoxes({ id: existing.id, ownerId: ctx.user.id }).catch(() => {});
    }
    return { id: existing.id, token: existing.token };
  }
  // Mismo patrón que el form de /dash/flota: template + env del motor + modelo default;
  // la credencial la resuelve el spawn por nombre canónico (solo OAuth se persiste).
  const env: Record<string, string> = {
    ...(engine.env ?? {}),
    // Buckets: sitios (Website + Files), sandbox (archivos/exec en la caja) y
    // hosting (launch_app/restart_machine). Sin lo demás: es un constructor.
    EASYBITS_TOOL_GROUP: "scripting,sitios,sandbox,hosting",
    // ghosty-gc no lee EASYBITS_TOOL_GROUP: arma su MCP con EASYBITS_TOOLS.
    EASYBITS_TOOLS: BUILDER_TOOLS,
  };
  if (engine.modelEnv && siteModel) env[engine.modelEnv] = siteModel;
  const created = await createFleetAgent(ctx, {
    name: builderNameFor(engine.id),
    systemPrompt: BUILDER_SYSTEM,
    workerTemplate: engine.template,
    env,
    oauthSecretName: engine.secret?.kind === "oauth" ? engine.secret.name : undefined,
    idleSuspendMin: 2,
  });
  if (picked) {
    const row = await db.fleetAgent.findUnique({ where: { id: created.id }, select: { persona: true } });
    await db.fleetAgent.update({ where: { id: created.id }, data: { persona: { ...((row?.persona as object | null) ?? {}), siteModelPicked: true } } });
  }
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
    select: { id: true, slug: true, subdomainEnabled: true, apexOf: { select: { domain: true, verified: true } } },
  });
  const bySite = Object.fromEntries(websites.map((w) => [w.id, w]));
  return rows.map((r) => ({ ...r, url: publicUrl(r, r.websiteId ? bySite[r.websiteId] : null) }));
}

/** Forma pública de un sitio (API v2, MCP `list_sites`, SDK, CLI `sites ls`). */
export type SiteSummary = {
  id: string;
  name: string;
  kind: "static" | "webapp";
  engine: string;
  stack: string | null;
  url: string | null;
  websiteId: string | null;
  sandboxId: string | null;
  createdAt: string;
};

/** Los sitios de /dash/sitios tal como los ve el panel, sin campos internos. */
export async function listSiteSummaries(ctx: AuthContext): Promise<SiteSummary[]> {
  return (await listSites(ctx)).map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind as SiteSummary["kind"],
    engine: s.engine ?? DEFAULT_SITE_ENGINE,
    stack: s.stack ?? null,
    url: s.url,
    websiteId: s.websiteId ?? null,
    sandboxId: s.sandboxId ?? null,
    createdAt: s.createdAt.toISOString(),
  }));
}

export async function getSite(ctx: AuthContext, id: string) {
  requireScope(ctx, "READ");
  const site = await db.site.findFirst({ where: { id, ownerId: ctx.user.id, ...NOT_DELETED } });
  if (!site) throw new Response("Site not found", { status: 404 });
  const website = site.websiteId
    ? await db.website.findUnique({
        where: { id: site.websiteId },
        select: { id: true, slug: true, subdomainEnabled: true, apexOf: { select: { domain: true, verified: true } } },
      })
    : null;
  const sandbox = site.sandboxId
    ? await db.sandbox.findUnique({ where: { sandboxId: site.sandboxId }, select: { status: true, runspec: true, currentReleaseId: true, workBox: true, tier: true } })
    : null;
  const stack = siteStack(site);
  return {
    ...site,
    website,
    sandbox,
    url: publicUrl(site, website),
    previewUrl: previewUrl(site, website, sandbox),
    hasAdmin: site.kind === "webapp" && !!stack && stackHasAuth(stack),
  };
}

type Row = { kind: string; sandboxId: string | null; stack?: string | null };
type Web = {
  slug: string;
  subdomainEnabled: boolean;
  apexOf?: { domain: string; verified: boolean }[];
} | null;

/** URL pública del sitio (lo que se comparte). Dominio propio gana si el sitio es su apex. */
function publicUrl(site: Row, website: Web) {
  if (site.kind === "static" && website) {
    const apex = website.apexOf?.find((d) => d.verified);
    if (apex) return `https://${apex.domain}`;
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
    // Con starter, el iframe ve el servidor dev (recarga en caliente); Node libre, la app.
    const port = siteStack(site) ? PREVIEW_PORT : ((sandbox?.runspec as { port?: number } | null)?.port ?? 3000);
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
  opts: { kind: SiteKind; name: string; tier?: string; engine?: string; model?: string | null; secretValue?: string; sleep?: boolean; stack?: SiteStack }
): Promise<{ site: { id: string }; checkoutUrl?: string }> {
  requireScope(ctx, "WRITE");
  const name = opts.name.trim() || "Mi sitio";
  const engine = getEngine(opts.engine ?? DEFAULT_SITE_ENGINE) ?? getEngine(DEFAULT_SITE_ENGINE)!;
  if (!engineCreatable(engine)) throw new Response("Ese motor aún no está disponible", { status: 400 });
  // "Si la llave no está, que te la pida": BYOK guarda la credencial en el vault del
  // dueño con su nombre canónico; el spawn del worker la lee de ahí.
  if (engine.secret) {
    const owned = (await listSecrets(ctx.user.id)).some((s) => s.name === engine.secret!.name);
    if (!owned) {
      const val = (opts.secretValue ?? "").trim();
      if (!val) throw new Response(`Falta la llave de ${engine.label.replace(/^Ghosty · /, "")}`, { status: 400 });
      await createSecret(ctx.user.id, { name: engine.secret.name, value: val });
    }
  }
  await ensureBuilderAgent(ctx, engine.id, opts.model);
  // El regalo solo tiene sentido en el motor medido: BYOK no gasta tokens de la cuenta.
  if (engineIsMetered(engine)) await grantStarterTokensIfNeeded(ctx.user.id).catch(() => {});
  if (opts.kind === "static") {
    const website = await createWebsite(ctx, { name });
    const site = await db.site.create({
      data: { ownerId: ctx.user.id, kind: "static", name, websiteId: website.id, engine: engine.id },
    });
    return { site };
  }
  // Construir no se cobra: la web app nace en una caja de trabajo de 4 GB que paga
  // EasyBits y duerme sola; se cobra al publicar (publishSite → promoteWorkBox). Con
  // stack nace del snapshot de plataforma (starter con dependencias ya instaladas).
  const { sandboxId } = await createWorkBox(ctx, {
    template: opts.stack ? starterTemplate(opts.stack) : "node",
    name,
    ...(opts.stack ? { derived: starterSnapshot(opts.stack) } : {}),
  });
  const site = await db.site.create({
    data: { ownerId: ctx.user.id, kind: "webapp", name, sandboxId, engine: engine.id, stack: opts.stack ?? null },
  });
  // Si sembrar falla, el sitio igual nace: el agente puede escribir el código.
  await prepareSiteMachine(ctx, site.id, sandboxId, opts.stack ?? null).catch((e) =>
    console.error("[sites] prepareSiteMachine", sandboxId, e)
  );
  return { site, checkoutUrl: undefined as string | undefined };
}

/**
 * Deja la caja de una webapp lista para el primer turno: runspec, puerto expuesto y,
 * si el stack lo trae, el starter en /app. Corre al crear el sitio con plan, al
 * enganchar la caja que nació en el webhook del checkout y antes de cada turno
 * (`ensureSiteMachine`). Idempotente: decide por lo que YA hay en /app, así que nunca
 * pisa código —sin package.json siembra el starter; sin easybits.json repite runspec
 * y puerto—.
 */
async function prepareSiteMachine(ctx: AuthContext, siteId: string, sandboxId: string, stack: SiteStack): Promise<{ auth?: boolean }> {
  const saved = (await db.sandbox.findUnique({ where: { sandboxId }, select: { runspec: true } }))?.runspec as
    | { appDir?: string; port?: number; secretNames?: string[] }
    | null
    | undefined;
  const runspec = stack ? starterRunspec(stack) : DEFAULT_RUNSPEC;
  const appDir = (saved?.appDir ?? runspec.appDir).replace(/\/$/, "");
  // Recién comprada la caja dice "provisioning" y el host responde 503 "sandbox not
  // running" a todo: así se perdió el starter de un sitio en prod (2026-10-15) con el
  // error tragado. Una dormida no se espera: el listado de abajo la despierta.
  if ((await getSandbox(ctx, sandboxId)).status !== "suspended") {
    await waitUntilRunning(ctx, sandboxId, { timeoutMs: 90_000 });
  }
  const have = await appDirEntries(ctx, sandboxId, appDir);
  if (!have.has("easybits.json")) {
    // Runspec desde el día cero: sin él `restart_machine` falla y el agente pierde un
    // turno descubriéndolo (pasó en la primera prueba). Si ya estaba guardado, solo se
    // re-escribe su espejo (`{}`): no se pisan cambios posteriores.
    await setRunspec(ctx, sandboxId, saved ? {} : runspec).catch(() => {});
    // La vista previa es la URL pública de la caja y `restart_machine` no expone nada.
    await exposeSandboxPort(ctx, sandboxId, saved?.port ?? runspec.port).catch(() => {});
  }
  // Nacida del snapshot de plataforma: el starter con node_modules ya está en el rootfs;
  // se copia a /app en <1 s y se marca instalado (la unit de preview no reinstala).
  let seeded = false;
  if (stack && !have.has("package.json")) {
    const src = `${STARTER_DIR}/${stack}`;
    const r = await execCommand(ctx, sandboxId, {
      command: `[ -d ${src}/node_modules ] && mkdir -p ${appDir} && cp -a ${src}/. ${appDir}/ && mkdir -p $(dirname ${PREVIEW_DEPS_MARK}) && touch ${PREVIEW_DEPS_MARK}`,
      timeoutSeconds: 60,
    }).catch(() => null);
    seeded = r?.exitCode === 0;
  }
  if (stack && !seeded && !have.has("package.json")) {
    // En tandas de 8: un starter trae ~30 archivos (en serie eran segundos de espera).
    // package.json va AL FINAL: es la marca de "sembrado", así una siembra a medias
    // se repite completa en vez de quedar dada por buena.
    const { "package.json": pkg, ...rest } = starterFiles(stack);
    const entries = Object.entries(rest);
    for (let i = 0; i < entries.length; i += 8) {
      await Promise.all(
        entries.slice(i, i + 8).map(([path, content]) =>
          writeFile(ctx, sandboxId, { path: `${appDir}/${path}`, content })
        )
      );
    }
    if (pkg) await writeFile(ctx, sandboxId, { path: `${appDir}/package.json`, content: pkg });
  }
  // Base y login del sitio: va ANTES de la unit de la vista previa para que arranque con
  // los secretos. Si falla, el sitio sigue (el agente puede trabajar sin base).
  if (stack && stackHasAuth(stack)) {
    await prepareSiteBackend(ctx, siteId, sandboxId, appDir, saved?.secretNames ?? [], have.has(SECRETS_FILE)).catch((e) =>
      console.error("[sites] prepareSiteBackend", sandboxId, e)
    );
  }
  if (stack) {
    // Vista previa en vivo (servidor dev). Si no queda, el turno sigue: el agente
    // puede compilar y publicar igual; por eso no se lanza.
    await exposeSandboxPort(ctx, sandboxId, PREVIEW_PORT).catch(() => {});
    const r = await execCommand(ctx, sandboxId, { command: previewInstallScript(stack, appDir), timeoutSeconds: 30 }).catch((e) => ({ exitCode: -1, stderr: String(e) }));
    if (r.exitCode !== 0) console.error("[sites] preview unit", sandboxId, r);
  }
  // ¿La app trae el login del starter? Los sitios creados antes de él no: el prompt no debe
  // anunciárselo (el agente afirmaba «ya tienes usuarios» sin tenerlos).
  if (stack && stackHasAuth(stack)) {
    const lib = await appDirEntries(ctx, sandboxId, `${appDir}/src/lib`).catch(() => null);
    return { auth: lib ? lib.has("auth.ts") : undefined };
  }
  return {};
}

const SITE_SECRETS = ["ADMIN_EMAIL", "BETTER_AUTH_SECRET", "EASYBITS_DB_URL"];

/** Nombre de la base de un sitio. Es también el nombre que la caja pide al mesh. */
export function siteDatabaseName(siteId: string) {
  return `site-${siteId}`;
}

/**
 * Base libSQL del sitio + secretos de su login. La caja la abre por el passthrough del
 * mesh (`EASYBITS_DB_URL`): el host firma un JWT de 10 min en cada petición, así que en la
 * caja no hay gate key, llave ni token que renovar. La fila Database usa el namespace del
 * mesh para que el dashboard y `db_query` vean la misma base. Idempotente.
 */
async function prepareSiteBackend(
  ctx: AuthContext,
  siteId: string,
  sandboxId: string,
  appDir: string,
  secretNames: string[],
  hasSecretsFile: boolean
) {
  const name = siteDatabaseName(siteId);
  const exists = await db.database.findUnique({ where: { userId_name: { userId: ctx.user.id, name } } });
  if (!exists) await createDatabase(ctx, { name, siteId, description: "Base de datos de la web app (login y datos)" });
  const missing = SITE_SECRETS.filter((n) => !secretNames.includes(n));
  if (missing.length) {
    const values: Record<string, string> = {
      // El dueño es el admin de su app: el starter crea esa cuenta en la primera migración.
      ADMIN_EMAIL: ctx.user.email,
      EASYBITS_DB_URL: `${MESH_DB_PASSTHROUGH}/${name}/`,
      BETTER_AUTH_SECRET: crypto.randomBytes(32).toString("base64url"),
    };
    await setMachineSecrets(ctx, sandboxId, Object.fromEntries(missing.map((n) => [n, values[n]])), { restart: false });
  }
  // La vista previa lee .easybits.env al arrancar, pero ese archivo sólo lo escribían
  // build y arranque («Publicar»): sin esto el dev nacía sin base ni secreto de login.
  if (missing.length || !hasSecretsFile) {
    await writeSecretsFile(ctx, sandboxId, { dir: appDir, names: [...new Set([...secretNames, ...SITE_SECRETS])] });
    await execCommand(ctx, sandboxId, { command: `systemctl try-restart ${PREVIEW_UNIT} || true`, timeoutSeconds: 20 }).catch(() => {});
  }
}

/**
 * Enlace para que el dueño entre a su app como admin, sin contraseña: lo valida el plugin
 * `eb-admin` del starter (src/lib/eb-admin.ts) con el mismo BETTER_AUTH_SECRET. Vale 2 min
 * y una sola vez. Apunta a la vista previa, que es lo que el dueño tiene enfrente.
 */
export async function siteAdminLoginUrl(ctx: AuthContext, siteId: string) {
  requireScope(ctx, "WRITE");
  const site = await getSite(ctx, siteId);
  const stack = siteStack(site);
  if (site.kind !== "webapp" || !site.sandboxId || !stack || !stackHasAuth(stack) || !site.previewUrl) {
    throw new Response("Este sitio no tiene login de admin", { status: 400 });
  }
  const secret = await getMachineSecretValue(ctx.user.id, site.sandboxId, "BETTER_AUTH_SECRET");
  if (!secret) throw new Response("La máquina aún no tiene su login listo", { status: 409 });
  const nonce = crypto.randomBytes(16).toString("hex");
  const exp = String(Date.now() + 60_000);
  const sig = crypto.createHmac("sha256", secret).update(`eb-admin-login.${nonce}.${exp}`).digest("hex");
  return `${site.previewUrl}/api/auth/eb/admin-login?nonce=${nonce}&exp=${exp}&sig=${sig}`;
}

/** Nombres en /app. Un /app inexistente es "vacío"; cualquier otro error se lanza
 *  para que nadie siembre a ciegas sobre código que no pudo ver. */
async function appDirEntries(ctx: AuthContext, sandboxId: string, appDir: string) {
  try {
    return new Set((await listFiles(ctx, sandboxId, { path: appDir })).entries.map((e) => e.name));
  } catch (e) {
    if (/no such file or directory/i.test(String(e))) return new Set<string>();
    throw e;
  }
}

/** Antes de cada turno: re-siembra si la preparación al crear el sitio falló. */
export async function ensureSiteMachine(ctx: AuthContext, site: { id: string; kind: string; sandboxId: string | null; stack?: string | null }) {
  if (site.kind !== "webapp" || !site.sandboxId) return {};
  return prepareSiteMachine(ctx, site.id, site.sandboxId, siteStack(site));
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
  await prepareSiteMachine(ctx, siteId, box.sandboxId, siteStack(site)).catch((e) =>
    console.error("[sites] prepareSiteMachine", box.sandboxId, e)
  );
  return getSite(ctx, siteId);
}

/** Publicar una webapp = launch_app sobre su caja (build + URL + release). */
export async function publishSite(ctx: AuthContext, siteId: string) {
  const site = await getSite(ctx, siteId);
  if (site.kind !== "webapp" || !site.sandboxId) throw new Response("Nothing to publish", { status: 400 });
  // Primera publicación: la caja de trabajo (gratis) pasa a cobrarse. Sin plan, el pago
  // va por checkout y al volver al editor se publica sola (?publicar=1).
  if (site.sandbox?.workBox) {
    const base = process.env.APP_URL || "https://www.easybits.cloud";
    const promo = await promoteWorkBox(ctx, site.sandboxId, {
      successUrl: `${base}/dash/sitios/${site.id}?publicar=1`,
      cancelUrl: `${base}/dash/sitios/${site.id}`,
    });
    if ("checkoutUrl" in promo) return { checkoutUrl: promo.checkoutUrl, monthlyMxn: promo.monthlyMxn };
  }
  // Conectado a GitHub: primero se sube el código (el repo es la fuente de verdad) y
  // luego se publica en el acto. El webhook de ESE commit se ignora (markSelfPushed).
  const gh = siteRepo(site.sandbox?.runspec);
  if (gh) {
    const sha = await pushSiteToGithub(ctx, site.sandboxId, gh, "Publicado desde EasyBits");
    if (sha) markSelfPushed(site.sandboxId, sha);
    const launch = await launchApp(ctx, { sandboxId: site.sandboxId, message: `Publicado desde /dash/sitios${sha ? ` (${sha.slice(0, 7)})` : ""}` });
    return { ...launch, github: gh.fullName, sha: sha?.slice(0, 7) ?? null };
  }
  return launchApp(ctx, { sandboxId: site.sandboxId, message: "Publicado desde /dash/sitios" });
}

export async function deleteSite(ctx: AuthContext, siteId: string, opts: { releaseMachine?: boolean } = {}) {
  requireScope(ctx, "DELETE");
  const site = await getSite(ctx, siteId);
  // Si el dueño pide liberar la máquina, va ANTES del soft-delete: si falla, el sitio
  // sigue en la lista y puede reintentar (al revés quedaba borrado y el reintento daba
  // «Site not found»). releasePermanent detiene el cobro y guarda un respaldo final.
  // Un 404 es «ya no hay máquina que liberar» (caja de preview sin compra, o ya
  // liberada desde Hosting): no bloquea el borrado.
  // Una caja de trabajo (sin publicar) la paga EasyBits: se libera siempre con el sitio.
  if ((opts.releaseMachine || site.sandbox?.workBox) && site.kind === "webapp" && site.sandboxId) {
    await releasePermanent(ctx, site.sandboxId).catch((e) => {
      if (e instanceof Response && e.status === 404) return;
      throw e;
    });
  }
  // Soft-delete: el Website sigue vivo (nunca borramos datos del usuario).
  await db.site.update({ where: { id: siteId }, data: { deletedAt: new Date() } });
}

// ─── Tema (botón «Tema»): el archivo de tema DENTRO del sitio es la fuente de verdad ─────────

const noTokens = () =>
  new Response(
    JSON.stringify({ error: "no_tokens", message: "Este sitio se hizo antes de los temas: sus colores no usan tokens. Pídele al agente «Adaptar a temas»." }),
    { status: 409, headers: { "Content-Type": "application/json" } }
  );

/** Dónde vive el tema del sitio y cómo leerlo/escribirlo. null = el sitio no usa tokens. */
async function themeSource(ctx: AuthContext, site: Awaited<ReturnType<typeof getSite>>) {
  if (site.kind === "static" && site.website) {
    const website = await db.website.findUnique({ where: { id: site.website.id }, select: { id: true, prefix: true } });
    const file = website
      ? await db.file.findFirst({ where: { ownerId: ctx.user.id, name: `${website.prefix}index.html`, status: { not: "DELETED" } }, select: { url: true } })
      : null;
    const html = file?.url ? await fetch(file.url).then((r) => (r.ok ? r.text() : null)).catch(() => null) : null;
    if (!html || !replaceStaticTheme(html, DEFAULT_SITE_THEME.colors)) return null;
    return {
      colors: parseThemeColors(html),
      write: (colors: ThemeColors) =>
        deployWebsiteFile(ctx, { websiteId: website!.id, fileName: "index.html", contentType: "text/html", content: replaceStaticTheme(html, colors)! }),
    };
  }
  const stack = site.kind === "webapp" && site.sandboxId ? siteStack(site) : null;
  const files = stack ? stackThemeFiles(stack) : null;
  if (!files) return null;
  const sandboxId = site.sandboxId!;
  // Sólo si el CSS principal importa el archivo: si no, escribirlo no cambiaría nada.
  const [main, theme] = await Promise.all([
    readFile(ctx, sandboxId, { path: `/app/${files.main}` }).catch(() => null),
    readFile(ctx, sandboxId, { path: `/app/${files.theme}` }).catch(() => null),
  ]);
  if (!main?.content.includes(files.importLine) || !theme) return null;
  return {
    colors: parseThemeColors(theme.content),
    write: (colors: ThemeColors) => writeFile(ctx, sandboxId, { path: `/app/${files.theme}`, content: themeCssTw4(colors) }),
  };
}

/** Colores actuales del sitio, o `supported:false` si se hizo antes de los temas. */
export async function getSiteTheme(ctx: AuthContext, siteId: string): Promise<{ supported: boolean; colors: ThemeColors | null }> {
  const src = await themeSource(ctx, await getSite(ctx, siteId));
  return { supported: !!src, colors: src?.colors ?? null };
}

/** Cambia el tema sin modelo: una paleta (`themeId`) o colores completos (`colors`). */
export async function setSiteTheme(ctx: AuthContext, siteId: string, input: { themeId?: string; colors?: unknown }): Promise<{ colors: ThemeColors }> {
  requireScope(ctx, "WRITE");
  const colors = input.themeId ? SITE_THEMES.find((t) => t.id === input.themeId)?.colors ?? null : validThemeColors(input.colors);
  if (!colors) {
    throw new Response(JSON.stringify({ error: "invalid_theme", message: "Tema inválido: manda themeId de la lista o todos los colores en #rrggbb." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const src = await themeSource(ctx, await getSite(ctx, siteId));
  if (!src) throw noTokens();
  await src.write(colors);
  return { colors };
}

/** Contexto por turno: qué sitio es y cómo tocarlo. Se appendea (capa 3), no pisa. */
export function siteTurnPrompt(site: Awaited<ReturnType<typeof getSite>>, selection?: { id: string; tag: string } | null, machine: { auth?: boolean } = {}) {
  const lines = [
    `SITIO ACTUAL: "${site.name}" (${site.kind}).`,
    // El usuario sólo ve el chat y la vista previa: sin esto un motor (Gemini) encadenaba
    // 28 tools sin una palabra y la vista previa no cambiaba hasta el final (14-oct).
    `El usuario te ve trabajar en vivo: antes de cada grupo de acciones escríbele UNA línea corta de lo que vas a hacer ("Armo la portada con tu foto…"). Y que la vista previa cambie pronto: primero deja la página principal mostrando un esqueleto de lo que pidió, luego llena el detalle.`,
    `Quien lee NO es programador: narra y responde con lo que va a VER o poder HACER ("Ya puedes crear tu cuenta", "Cada quien ve sólo sus tareas"), nunca cómo está hecho. Prohibido en el chat: nombres de frameworks o paquetes, starter, doc, tsc/TypeScript, errores de compilación, rutas o URLs internas (/tareas, /login), funciones de servidor, sesión, capa de datos, scripts, logs. Si algo técnico falla, arréglalo en silencio; sólo avisa lo que le afecta a la persona.`,
  ];
  if (site.kind === "static" && site.website) {
    lines.push(
      `Es un sitio ESTÁTICO: websiteId="${site.website.id}", slug="${site.website.slug}".`,
      `Escribe/actualiza el HTML con deploy_website_file({ websiteId, fileName: "index.html", contentType: "text/html", content }). Assets extra (css/js/img) con el mismo tool y su fileName. Para leer lo que ya hay: list_website_files + get_file.`,
      `Reglas del HTML: documento completo con <script src="https://cdn.tailwindcss.com"></script>, responsive, y CADA sección/elemento de bloque (header, section, article, footer, nav, form, cada card) lleva un atributo data-eb-id ÚNICO y estable (ej. data-eb-id="hero", "precios-card-2"). Conserva los data-eb-id existentes al editar; cambia SOLO lo que se pide.`,
      `No crees otro website: usa SIEMPRE ese websiteId.`,
      // Tema: el bloque va tal cual justo después del script de Tailwind; el botón «Tema» lo
      // reescribe sin modelo (replaceStaticTheme lo busca por sus ids).
      `Justo después del script de Tailwind, el <head> lleva ESTE bloque de tema tal cual (si ya existe, consérvalo idéntico):\n${themeBlockStatic(DEFAULT_SITE_THEME.colors)}`,
      themeRule("el bloque eb-theme del <head>")
    );
  } else if (site.kind === "webapp" && site.sandboxId) {
    const stack = siteStack(site);
    lines.push(
      `Es una WEB APP en su propia máquina: sandboxId="${site.sandboxId}". El código vive en /app.`,
      // Cada tool remota cuesta ~450 ms (medido) y reescribir un archivo entero cuesta tokens
      // de salida: se le enseñan las tools de edición quirúrgica de la caja.
      `Trabaja con las tools de la caja: lee con sandbox_files_read/sandbox_files_list; para CAMBIAR un archivo existente usa sandbox_files_edit (oldString→newString) o sandbox_apply_patch si son varios cambios o archivos en una sola llamada — NO lo reescribas entero con sandbox_files_write, que es solo para archivos nuevos. Errores del servidor: sandbox_logs. Junta comandos relacionados en un solo sandbox_exec.`,
      // sandbox_exec es bloqueante (tope 600 s) y no da señales de vida: un npm install o un
      // build largo se quedaba mudo o se cortaba. Mismo patrón que execLong en gs.
      `Comandos LARGOS (npm install de varios paquetes, build, tests): lánzalos con sandbox_exec_background y sigue su avance con sandbox_exec_status (cuéntale al usuario lo que va pasando); si se queda sin escribir nada varios minutos, revisa y mátalo con sandbox_exec_kill. Si perdiste el execId, sandbox_exec_list. Nunca uses nohup ni & dentro de sandbox_exec.`,
      ...(stack
        ? starterPrompt(stack, machine.auth)
        : [
            `Stack por default: Node con un servidor en el puerto 3000 (Express/Hono según pida), package.json con scripts build y start.`,
            `Para que la vista previa refleje cambios: tras editar, llama restart_machine({ sandboxId }).`,
          ]),
      site.sandbox?.workBox
        ? `NO publiques ni llames launch_app: esta app aún no se publica y eso lo hace el dueño con el botón «Publicar» del editor (ahí empieza a cobrarse su máquina). Al terminar, dile que puede verla en la vista previa y publicarla con ese botón.`
        : `Para PUBLICAR (build + release versionado) llama launch_app({ sandboxId }) — solo cuando el usuario lo pida o al terminar la primera versión.`,
      `No crees máquinas nuevas ni uses otro sandboxId.`
    );
    const gh = siteRepo(site.sandbox?.runspec);
    if (gh) {
      lines.push(
        `Esta web app está CONECTADA a GitHub (${gh.fullName}, rama main). NO llames launch_app ni hagas git push tú: publicar es el botón «Publicar» del usuario, que sube /app a GitHub y despliega. Si el usuario empuja cambios desde su compu, /app se re-clona del repo: lo que hayas editado sin publicar se pierde, así que al terminar un cambio pídele que publique.`
      );
    }
  } else if (site.kind === "webapp") {
    lines.push("La máquina de esta web app aún no existe (pago pendiente). Explica al usuario que complete el pago desde el panel; NO crees una máquina.");
  }
  if (selection) {
    lines.push(`ELEMENTO SELECCIONADO por el usuario en la vista previa: <${selection.tag} data-eb-id="${selection.id}">. Su petición se refiere a ese elemento; modifica solo ese nodo salvo que pida otra cosa.`);
  }
  return lines.join("\n");
}

export { siteGroupId };
