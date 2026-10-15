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
import { createSecret, listSecrets } from "./secretOperations";
import { FLEET_ENGINES, DEFAULT_SITE_ENGINE, getEngine, engineCreatable, engineIsMetered, type FleetEngine } from "~/lib/fleetEngines";
import { createWebsite } from "./operations";
import { buyMachine } from "./machineOperations";
import { launchApp, setRunspec } from "./releaseOperations";
import { execCommand, exposeSandboxPort, getSandbox, listFiles, waitUntilRunning, writeFile } from "./sandboxOperations";
import { PREVIEW_PORT, previewInstallScript, starterFiles, starterPrompt, starterRunspec, starterTemplate } from "~/.server/starters";
import { isSiteStack, type SiteStackId } from "~/lib/siteStacks";
import { pushSiteToGithub, siteRepo } from "./githubSiteOperations";
import { markSelfPushed } from "./pushDeployOperations";

export const BUILDER_NAME = "Sitios Builder";
// Motor por default: `easybits` = ghosty-gc contra el proxy medido (/api/v2/llm/v1),
// que YA descuenta del bucket de tokens LLM del dueño y responde 402 sin saldo. Los
// demás motores (claude/deepseek/codex) son BYOK: la llave del dueño, del vault.
const BUILDER_TEMPLATE = "ghosty-gc";

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
    // Builder easybits nacido antes del motor medido (claude-worker): se migra en sitio
    // y se recicla su caja (el env es spawn-baked; la VM viva seguiría con el motor viejo).
    if (engine.id === DEFAULT_SITE_ENGINE && existing.workerTemplate !== BUILDER_TEMPLATE) {
      const persona = (existing.persona as { env?: Record<string, string>; siteModelPicked?: boolean } | null) ?? {};
      await db.fleetAgent.update({
        where: { id: existing.id },
        data: {
          workerTemplate: BUILDER_TEMPLATE,
          persona: { ...persona, env: { ...(persona.env ?? {}), GHOSTY_LLM: DEFAULT_SITE_ENGINE } },
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
    ? await db.sandbox.findUnique({ where: { sandboxId: site.sandboxId }, select: { status: true, runspec: true, currentReleaseId: true } })
    : null;
  return { ...site, website, sandbox, url: publicUrl(site, website), previewUrl: previewUrl(site, website, sandbox) };
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
  // Por default duerme sin visitas: el caso típico es una landing con backend y poco tráfico.
  const bought = await buyMachine(ctx, { tier: opts.tier ?? "micro", template: opts.stack ? starterTemplate(opts.stack) : "node", name, sleep: opts.sleep ?? true });
  const sandboxId = "machine" in bought && bought.machine ? bought.machine.sandboxId : null;
  const site = await db.site.create({
    data: { ownerId: ctx.user.id, kind: "webapp", name, sandboxId, engine: engine.id, stack: opts.stack ?? null },
  });
  // La máquina ya se compró: si sembrar falla, el sitio igual nace (el agente puede
  // escribir el código) en vez de dejar una caja cobrada sin sitio.
  if (sandboxId) {
    await prepareSiteMachine(ctx, sandboxId, opts.stack ?? null).catch((e) =>
      console.error("[sites] prepareSiteMachine", sandboxId, e)
    );
  }
  return { site, checkoutUrl: "checkoutUrl" in bought ? bought.checkoutUrl : undefined };
}

/**
 * Deja la caja de una webapp lista para el primer turno: runspec, puerto expuesto y,
 * si el stack lo trae, el starter en /app. Corre al crear el sitio con plan, al
 * enganchar la caja que nació en el webhook del checkout y antes de cada turno
 * (`ensureSiteMachine`). Idempotente: decide por lo que YA hay en /app, así que nunca
 * pisa código —sin package.json siembra el starter; sin easybits.json repite runspec
 * y puerto—.
 */
async function prepareSiteMachine(ctx: AuthContext, sandboxId: string, stack: SiteStack) {
  const saved = (await db.sandbox.findUnique({ where: { sandboxId }, select: { runspec: true } }))?.runspec as
    | { appDir?: string; port?: number }
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
  if (stack && !have.has("package.json")) {
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
  if (stack) {
    // Vista previa en vivo (servidor dev). Si no queda, el turno sigue: el agente
    // puede compilar y publicar igual; por eso no se lanza.
    await exposeSandboxPort(ctx, sandboxId, PREVIEW_PORT).catch(() => {});
    const r = await execCommand(ctx, sandboxId, { command: previewInstallScript(stack, appDir), timeoutSeconds: 30 }).catch((e) => ({ exitCode: -1, stderr: String(e) }));
    if (r.exitCode !== 0) console.error("[sites] preview unit", sandboxId, r);
  }
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
export async function ensureSiteMachine(ctx: AuthContext, site: { kind: string; sandboxId: string | null; stack?: string | null }) {
  if (site.kind !== "webapp" || !site.sandboxId) return;
  await prepareSiteMachine(ctx, site.sandboxId, siteStack(site));
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
  await prepareSiteMachine(ctx, box.sandboxId, siteStack(site)).catch((e) =>
    console.error("[sites] prepareSiteMachine", box.sandboxId, e)
  );
  return getSite(ctx, siteId);
}

/** Publicar una webapp = launch_app sobre su caja (build + URL + release). */
export async function publishSite(ctx: AuthContext, siteId: string) {
  const site = await getSite(ctx, siteId);
  if (site.kind !== "webapp" || !site.sandboxId) throw new Response("Nothing to publish", { status: 400 });
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
    const stack = siteStack(site);
    lines.push(
      `Es una WEB APP en su propia máquina: sandboxId="${site.sandboxId}". El código vive en /app.`,
      `Escribe archivos con sandbox_files_write y corre comandos con sandbox_exec (npm install, etc.).`,
      ...(stack
        ? starterPrompt(stack)
        : [
            `Stack por default: Node con un servidor en el puerto 3000 (Express/Hono según pida), package.json con scripts build y start.`,
            `Para que la vista previa refleje cambios: tras editar, llama restart_machine({ sandboxId }).`,
          ]),
      `Para PUBLICAR (build + release versionado) llama launch_app({ sandboxId }) — solo cuando el usuario lo pida o al terminar la primera versión.`,
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
