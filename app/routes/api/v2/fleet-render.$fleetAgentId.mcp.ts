import type { Route } from "./+types/fleet-render.$fleetAgentId.mcp";
import { authFleetAgent } from "~/.server/apiAuth";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { db } from "~/.server/db";
import type { AuthContext } from "~/.server/apiAuth";
import { ok, fail } from "~/.server/mcp/responses";
import { renderViaBoxAndStore, captureScreenshot, auditPage, type RenderOptions } from "~/.server/core/fleetRender";
import { compareRender } from "~/.server/core/renderCompare";
import { COMPARE_RENDER_DESC, compareRenderShape, compareRenderHint } from "~/.server/mcp/compareRenderTool";
import { CLONE_PDF_DESC, clonePdfShape, clonePdfHint } from "~/.server/mcp/clonePdfTool";
import { clonePdf } from "~/.server/core/pdfClone";
import { browserOnBox, BrowserSessionGone, looksBlocked, type BrowserAction, type BrowserView } from "~/.server/core/renderClient";
import { hasLiveTurn, noteBrowserStep, pushBrowserFrame } from "~/.server/core/siteTurns.server";
import { getPlatformPublicClient, buildPublicAssetUrl } from "~/.server/storage";
import { randomUUID } from "node:crypto";
import { consumeService } from "~/.server/services/consume";
import { QuotaExceededError } from "~/.server/services/errors";
import { INTERACT_COST } from "~/.server/services/providers/brightdata";
import { releaseHandoff, waitForRelease } from "~/.server/core/browserHandoff";

// Dedicated, always-on `render` MCP server for FleetAgents — Streamable-HTTP.
// Injected per-turn into EVERY fleet agent (NOT gated by the easybits builtin
// toggle), so the agent can make PDFs/screenshots even with the EasyBits MCP off
// in the group. Auth = the fleetAgent's bearer token (header or ?token=), which
// resolves to the owner's AuthContext for ensureServiceBox + Files upload.
//
// Mirrors handler.ts (the /api/mcp Streamable-HTTP setup) but with a tiny tool
// surface and fleetAgent-token auth instead of an API key.

// ── Navegador antibot ──────────────────────────────────────────────────────────────────
// El Chromium de la caja sale de una IP de datacenter: buscadores y sitios con Cloudflare le
// ponen captcha y el agente se atoraba (23-oct, DuckDuckGo/Bing/Google en un turno de Sitios).
// Si la página que abrió es un muro antibot, la misma sesión se reabre por el navegador
// remoto de Bright Data (CDP) y se cobra como consulta web (tarifa plana por sesión). Sólo en
// ese caso: navegar todo por ahí costaría por GB lo que hoy es gratis.
/** Sesiones que ya van por el navegador antibot: no se reabren otra vez. */
const remoteSessions = new Set<string>();
// Hosts que bloquean al Chromium de la caja: van DIRECTO al navegador antibot y se ahorran el
// intento local (5-15 s perdidos por página). Los buscadores bloquean siempre; el resto se
// aprende la primera vez que un host regresa captcha y se recuerda una hora.
const ALWAYS_BLOCKED = /(^|\.)(google\.[a-z.]+|duckduckgo\.com|bing\.com|search\.brave\.com|yandex\.[a-z]+)$/;
const learnedBlocked = new Map<string, number>();
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return "";
  }
};
const knownBlocked = (u: string) => {
  const h = hostOf(u);
  if (!h) return false;
  if (ALWAYS_BLOCKED.test(h)) return true;
  const at = learnedBlocked.get(h);
  return !!at && Date.now() - at < 60 * 60_000;
};
const learnBlocked = (u: string) => {
  const h = hostOf(u);
  if (!h) return;
  learnedBlocked.set(h, Date.now());
  if (learnedBlocked.size > 500) learnedBlocked.delete(learnedBlocked.keys().next().value!);
};
const DOMAIN_LIMIT_HINT =
  "El navegador antibot sólo navega dentro del dominio con que se abrió. Para otro sitio, abre otra sesión con browser_open.";

async function ctxForOwner(ownerId: string): Promise<AuthContext | null> {
  const user = await db.user.findUnique({ where: { id: ownerId } });
  return user ? { user, scopes: ["READ", "WRITE", "DELETE"] } : null;
}

const PAPER: Record<string, { w: number; h: number }> = {
  letter: { w: 8.5, h: 11 },
  a4: { w: 8.27, h: 11.7 },
  legal: { w: 8.5, h: 14 },
};

/** Qué hizo la última acción, en palabras, para el panel («Escribió “Cholula”»). */
function actionLabel(actions: BrowserAction[] | undefined, names: Map<string, string>): string | undefined {
  const a = actions?.[actions.length - 1];
  if (!a) return undefined;
  const el = "ref" in a && a.ref ? names.get(a.ref) : undefined;
  const q = (t?: string) => (t ? `«${t.slice(0, 40)}»` : "");
  switch (a.type) {
    case "click": return `Clic en ${q(el ?? a.text) || "un elemento"}`;
    case "type": return `Escribió ${q(a.text)}${a.submit ? " y dio Enter" : ""}`;
    case "press": return `Tecla ${a.key}`;
    case "select": return `Eligió ${q(a.value)}`;
    case "scroll": return a.direction === "up" ? "Subió en la página" : "Bajó en la página";
    case "wait": return "Esperó a que cargara";
    case "goto": return `Fue a ${a.url}`;
    case "back": return "Regresó a la página anterior";
  }
}

// Nombres de los elementos de la última vista por sesión: el paso dice «Clic en Buscar», no «ref 3».
const lastNames = new Map<string, Map<string, string>>();

function buildRenderServer(ctx: AuthContext, panel?: { fleetAgentId: string; groupId: string }): McpServer {
  const server = new McpServer({ name: "easybits-render", version: "1.0.0" });
  // ok()/fail() return structuredContent: unknown, which the SDK's stricter
  // CallToolResult type rejects; server.ts dodges this via wrapHandler→any. Same here.
  const tool = (name: string, desc: string, shape: Record<string, unknown>, cb: (p: any) => Promise<unknown>) =>
    server.tool(name, desc, shape as any, cb as any);

  tool(
    "render_url",
    "Captura una URL pública a PDF o PNG con la caja de render (Chromium). Navega de verdad y espera a que la red se calme (networkidle) antes de capturar. Devuelve { fileId, url } — mándala al chat como ADJUNTO.\n\n- Sólo URLs públicas: la caja rechaza direcciones privadas o loopback.\n- Si la página pinta tarde (fuentes, animaciones), sube `wait_ms`.\n- Para HTML que aún no publicas, usa `render_html`.",
    {
      url: z.string().url().describe("URL pública (https://…) a capturar"),
      format: z.enum(["pdf", "png"]).default("png"),
      full_page: z.boolean().optional().describe("screenshot: capturar la página completa scrolleable"),
      width: z.number().optional().describe("ancho del viewport en px"),
      height: z.number().optional().describe("alto del viewport en px"),
      landscape: z.boolean().optional().describe("pdf: orientación horizontal"),
      paper: z.enum(["letter", "a4", "legal"]).optional().describe("pdf: tamaño de papel"),
      wait_ms: z.number().optional().describe("esperar N ms tras cargar antes de capturar"),
    },
    async (p) => {
      try {
        const options: RenderOptions = {
          fullPage: p.full_page,
          width: p.width,
          height: p.height,
          landscape: p.landscape,
          waitMs: p.wait_ms,
          ...(p.paper ? { paperWidth: PAPER[p.paper].w, paperHeight: PAPER[p.paper].h } : {}),
        };
        const r = await renderViaBoxAndStore(ctx, { format: p.format, url: p.url, options });
        return ok(r);
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  tool(
    "render_html",
    "Renderiza HTML auto-contenido a PDF o PNG con la caja de render on-demand (Chromium). La caja espera a las imágenes y a las fuentes antes de capturar, y `wait_ms` añade margen extra si algo entra tarde. Devuelve { fileId, url } — mándala al chat como ADJUNTO. Para facturas/cotizaciones/reportes estructurados usa structured_doc, NO esto.",
    {
      html: z.string().describe("HTML completo y auto-contenido"),
      format: z.enum(["pdf", "png"]).default("pdf"),
      full_page: z.boolean().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      landscape: z.boolean().optional(),
      paper: z.enum(["letter", "a4", "legal"]).optional(),
      wait_ms: z.number().optional().describe("esperar N ms tras cargar antes de capturar"),
      file_name: z.string().optional().describe("nombre base del archivo de salida"),
    },
    async (p) => {
      try {
        const options: RenderOptions = {
          fullPage: p.full_page,
          width: p.width,
          height: p.height,
          landscape: p.landscape,
          waitMs: p.wait_ms,
          ...(p.paper ? { paperWidth: PAPER[p.paper].w, paperHeight: PAPER[p.paper].h } : {}),
        };
        const r = await renderViaBoxAndStore(ctx, { format: p.format, html: p.html, fileName: p.file_name, options });
        return ok(r);
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  tool(
    "screenshot_url",
    "VE cómo se ve una página. Renderiza HTML auto-contenido (o una URL pública) en un Chromium real y devuelve { fileId, url } de la imagen. Úsala para VERIFICAR tu propio trabajo: captura → mírala con `see_image` → corrige → repite.\n\n- `html` es lo normal aquí: te deja revisar un borrador SIN publicarlo. `url` navega de verdad y espera a networkidle.\n- `preset`: 'mobile' (390px, DEFAULT — el peor caso, donde se rompen las landings) o 'desktop' (1440px).\n- La emulación es REAL: 'mobile' trae densidad 3x y touch, no sólo un viewport angosto.\n- **`data_id` recorta a UN elemento** — úsalo. Una landing móvil entera sale de 1170x18324 y mirarla tarda minutos; la tarjeta sola son ~400x300 (59x menos píxeles, medido). Es el paso 2 tras `audit_page`: por cada `incomplete`, pasa su `dataId` aquí y MÍRALO. Sin data-id, usa `selector` (CSS).\n- `padding` (default 16) deja ver el fondo: en 'texto sobre imagen' el fondo ES lo que juzgas.\n- `wait_ms` se honra (la caja ya espera imágenes y fuentes por su cuenta).\n- Si sale de un solo color, la respuesta trae `warning`: el CSS no había pintado, NO que rompiste la página — sube `wait_ms` y reintenta.\n- Gratis, no consume créditos.",
    {
      html: z.string().max(2_000_000).optional().describe("HTML completo y auto-contenido. GANA sobre url."),
      url: z.string().url().optional().describe("URL pública http/https a capturar."),
      preset: z.enum(["mobile", "desktop"]).optional().describe("mobile = 390x844 (default). desktop = 1440x900."),
      viewport: z.object({ width: z.number().int().min(240).max(3840), height: z.number().int().min(320).max(4000) }).optional(),
      full_page: z.boolean().optional().describe("Página completa scrolleable. Default true."),
      fullPage: z.boolean().optional().describe("Alias de `full_page`."),
      // Se aceptan las DOS grafías: esta superficie usa snake_case pero el campo
      // que devuelve audit_page se llama `dataId`, y un parámetro desconocido lo
      // descarta zod EN SILENCIO — devolviendo la página entera como si nada.
      // Un recorte que no recorta y no avisa cuesta más que un error.
      data_id: z.string().max(200).optional().describe("Recortar a este nodo (el `dataId` de audit_page). Mucho más barato de mirar."),
      dataId: z.string().max(200).optional().describe("Alias de `data_id`."),
      selector: z.string().max(400).optional().describe("Selector CSS al que recortar, si el nodo no tiene data-id. `data_id` gana."),
      padding: z.number().int().min(0).max(200).optional().describe("Margen alrededor del recorte. Default 16."),
      wait_ms: z.number().int().min(0).max(30000).optional().describe("Esperar N ms tras cargar, antes de capturar."),
      waitMs: z.number().int().min(0).max(30000).optional().describe("Alias de `wait_ms`."),
      file_name: z.string().max(120).optional(),
    },
    async (p) => {
      try {
        const r = await captureScreenshot(ctx, {
          html: p.html,
          url: p.url,
          preset: p.preset,
          viewport: p.viewport,
          fullPage: p.full_page ?? p.fullPage,
          waitMs: p.wait_ms ?? p.waitMs,
          fileName: p.file_name,
          dataId: p.data_id ?? p.dataId,
          selector: p.selector,
          padding: p.padding,
        });
        // La captura también es lo que «ve» el agente: va al panel como frame del navegador.
        // Sin esto el paso se quedaba en «Cargando la página…» aunque el agente sí capturaba.
        if (panel && r.url && hasLiveTurn(panel.fleetAgentId, panel.groupId)) {
          pushBrowserFrame(
            panel.fleetAgentId,
            panel.groupId,
            {
              url: p.url ?? "Borrador (HTML sin publicar)",
              title: p.url ? new URL(p.url).hostname : "Borrador",
              image: r.url,
              action: (p.data_id ?? p.dataId ?? p.selector) ? `Captura de ${p.data_id ?? p.dataId ?? p.selector}` : `Captura ${r.preset}`,
            },
            "screenshot_url"
          );
        }
        return ok({
          ...r,
          hint: r.warning
            ? `Captura lista PERO ${r.warning}`
            : (p.data_id ?? p.dataId ?? p.selector)
              ? `Recorte de \`${p.data_id ?? p.dataId ?? p.selector}\` listo (${r.width}x${r.height}). Míralo con see_image({imageUrl}).`
              : `Captura ${r.preset} lista (${r.width}x${r.height}). Mírala con see_image({imageUrl}) antes de decir que quedó bien.`,
        });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  tool(
    "audit_page",
    "MIDE una página en vez de opinar sobre ella: axe-core sobre el DOM ya pintado (contraste REAL, con los colores que de verdad se ven) más medición de layout, a varios viewports. Devuelve el nodo culpable, no un consejo genérico.\n\n- `html` (auto-contenido) o `url`. `html` GANA.\n- Por default audita móvil (390), tablet (768) y desktop (1440).\n- Lee `axe.violations` y `axe.incomplete` POR SEPARADO: `incomplete` es lo que axe NO PUEDE decidir solo — típicamente texto sobre gradiente o sobre imagen. Eso verifícalo TÚ capturando con `screenshot_url` y mirándola; no lo cuentes como fallo ni lo ignores.\n- `layout.findings`: `horizontal-overflow` (con `measured.overflowPx`), `text-clipped`, `overlap` y `missing-viewport-meta`.\n- Cada hallazgo trae `dataId` — úsalo para arreglar EXACTAMENTE ese nodo en vez de reescribir la página.\n- En desborde horizontal se reporta UN culpable por cadena: arregla ése y vuelve a auditar.\n- Gratis, no consume créditos.",
    {
      html: z.string().max(2_000_000).optional().describe("HTML completo y auto-contenido. GANA sobre url."),
      url: z.string().url().optional().describe("URL pública http/https a auditar."),
      viewports: z
        .array(
          z.object({
            name: z.string().max(40),
            width: z.number().int().min(240).max(3840),
            height: z.number().int().min(320).max(4000),
            deviceScaleFactor: z.number().min(1).max(4).optional(),
            isMobile: z.boolean().optional(),
          })
        )
        .max(6)
        .optional()
        .describe("Default: mobile 390 · tablet 768 · desktop 1440."),
      wait_ms: z.number().int().min(0).max(30000).optional().describe("Esperar N ms tras cargar, antes de medir."),
    },
    async (p) => {
      try {
        const r = await auditPage(ctx, {
          html: p.html,
          url: p.url,
          viewports: p.viewports,
          waitMs: p.wait_ms,
        });
        const vps = r.viewports ?? [];
        const violations = vps.reduce((n, v) => n + (v.axe?.violations?.length ?? 0), 0);
        const incomplete = vps.reduce((n, v) => n + (v.axe?.incomplete?.length ?? 0), 0);
        const layout = vps.reduce((n, v) => n + (v.layout?.findings?.length ?? 0), 0);
        return ok({
          ...r,
          hint:
            violations + layout === 0
              ? `Sin fallos en ${vps.length} viewport(s).` +
                (incomplete ? ` Quedan ${incomplete} caso(s) 'incomplete' que debes verificar mirando la captura.` : "")
              : `${violations} violación(es) de accesibilidad y ${layout} problema(s) de layout en ${vps.length} viewport(s).` +
                (incomplete ? ` Además ${incomplete} caso(s) 'incomplete' que debes verificar mirando.` : ""),
        });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  // Mismo contrato que el MCP principal; aquí sin créditos, como el resto de este
  // servidor (el costo real es la caja del owner).
  tool("compare_render", COMPARE_RENDER_DESC.replace(/\n- Cost: .*$/, "\n- Gratis, no consume créditos."), compareRenderShape, async (p) => {
    try {
      if (!p.fileId && !p.pdfUrl) return fail("Pasa `fileId` o `pdfUrl` del PDF original.");
      const r = await compareRender(ctx, p);
      return ok({ ...r, hint: compareRenderHint(r) });
    } catch (e) {
      return fail((e as Error).message);
    }
  });

  tool("clone_pdf", CLONE_PDF_DESC.replace(/\n- Cost: .*$/, "\n- Gratis, no consume créditos."), clonePdfShape, async (p) => {
    try {
      if (!p.fileId && !p.pdfUrl) return fail("Pasa `fileId` o `pdfUrl` del PDF.");
      const r = await clonePdf(ctx, p);
      return ok({ ...r, hint: clonePdfHint(r) });
    } catch (e) {
      return fail((e as Error).message);
    }
  });

  // ── Navegador con estado (nivel 1 de computer use) ──
  // La página sigue viva entre llamadas en la caja de render del owner. El agente apunta
  // por `ref` (de `elements`), no por coordenadas, y pide captura sólo cuando la necesita.
  const BROWSER_RULES =
    "\n\n- Cada respuesta trae `url`, `title`, `text` (texto visible) y `elements`: lo que se puede tocar, con su `ref`. Los `ref` cambian tras cada acción: usa los de la ÚLTIMA respuesta." +
    "\n- `screenshot: true` añade la captura del viewport como imagen. Pídela sólo cuando el texto no baste (diseño, CAPTCHA, imágenes): pesa en tu contexto." +
    "\n- La sesión dura ~3 min sin uso. Si responde que ya no existe, abre otra." +
    "\n- Sólo URLs públicas. No escribas contraseñas, tarjetas ni datos sensibles, ni resuelvas CAPTCHAs: pídeselo a la persona con `browser_ask_human` (inicia sesión, pasa el captcha o el código y te devuelve el control en el mismo turno)." +
    "\n- Antes de decir que algo quedó, compruébalo en la página (el texto o la URL de la última respuesta). Si la página no cambia tras una acción, no la repitas igual: cambia de plan o pide ayuda.";
  // Una página con campo de contraseña: que pida ayuda en vez de escribirla.
  const LOGIN_HINT = "La página pide iniciar sesión. No escribas la contraseña: llama browser_ask_human para que la persona entre y te devuelva el control.";
  const loginHint = (v: BrowserView) => (v.elements?.some((e) => (e as { type?: string }).type === "password") ? LOGIN_HINT : undefined);
  // Pedir ayuda: tramos de 2 min (la llamada MCP no se queda colgada más) hasta 10 min en total.
  const ASK_CHUNK_MS = 120_000;
  const ASK_TOTAL_MS = 10 * 60_000;
  const askedAt = new Map<string, number>();

  // La caja SIEMPRE manda captura: el panel «la computadora del agente» la necesita. Al modelo
  // sólo le llega si la pidió (pesa en su contexto).
  const browserReply = async (v: BrowserView, opts: { wanted?: boolean; hint?: string; tool: string; actions?: BrowserAction[]; needsHuman?: string; extra?: Record<string, unknown> }) => {
    // `pageShot` (la página completa) es sólo para el panel: al modelo nunca le llega.
    const { screenshot, pageShot, scrollY, ...rest } = v;
    const names = lastNames.get(v.sessionId);
    if (panel && screenshot && hasLiveTurn(panel.fleetAgentId, panel.groupId)) {
      try {
        const key = `agent-frames/${randomUUID()}.jpg`;
        await getPlatformPublicClient().putObject(key, Buffer.from(pageShot ?? screenshot, "base64"), "image/jpeg");
        pushBrowserFrame(panel.fleetAgentId, panel.groupId, {
          url: v.url,
          title: v.title,
          image: buildPublicAssetUrl(key),
          viewport: v.viewport ?? undefined,
          target: v.target ?? undefined,
          ...(pageShot && scrollY ? { scrollY } : {}),
          action: v.failed ? `Falló: ${v.failed.error}` : actionLabel(opts.actions, names ?? new Map()),
          sessionId: v.sessionId,
          // El panel enseña «Te necesito aquí · …» con «Tomar el control» al frente y se abre solo.
          ...(opts.needsHuman ? { needsHuman: opts.needsHuman } : {}),
        }, opts.tool);
      } catch (e) {
        console.error("[render] frame del panel", (e as Error).message);
      }
    }
    lastNames.set(v.sessionId, new Map(v.elements.map((e) => [e.ref, e.name])));
    if (lastNames.size > 200) lastNames.delete(lastNames.keys().next().value!);
    const r = ok({ ...rest, ...(opts.extra ?? {}), ...(opts.hint ? { hint: opts.hint } : {}) }) as { content: unknown[] };
    if (screenshot && opts.wanted) r.content.push({ type: "image", data: screenshot, mimeType: "image/jpeg" });
    return r;
  };
  const browserFail = (e: unknown) => fail(e instanceof BrowserSessionGone ? e.message : (e as Error).message);

  // Lo que el panel cuenta de la espera es lo que de verdad pasa: si el antibot falla se dice y por
  // qué, en vez de que el siguiente aviso («salió un captcha») tape la falla anterior.
  const note = (text: string, icon: "antibot" | "page" = "antibot") => {
    if (panel) noteBrowserStep(panel.fleetAgentId, panel.groupId, { icon, text });
  };
  let antibotFailed: string | null = null;
  // El costo, a la vista de la persona en el momento (no sólo en lo que lee el agente).
  const ANTIBOT_PRICE = `${INTERACT_COST} consultas web si abre`;
  /** Reabre en el navegador antibot. Regresa la vista nueva o por qué no se pudo. Sólo cobra si abrió. */
  const antibot = async (url: string, mobile?: boolean, why: "known" | "captcha" = "known"): Promise<{ v: BrowserView } | { error: string }> => {
    note(
      antibotFailed
        ? `El navegador antibot falló a la primera (${antibotFailed}): lo reintento · ${ANTIBOT_PRICE} · suele tardar ~20 s`
        : why === "captcha"
          ? `Salió un captcha: lo reintento por el navegador antibot · ${ANTIBOT_PRICE} · suele tardar ~20 s`
          : `${hostOf(url) || "Este sitio"} bloquea navegadores automáticos: lo abro por el navegador antibot · ${ANTIBOT_PRICE} · suele tardar ~20 s`
    );
    try {
      let v: BrowserView | undefined;
      // Sin página completa: por el navegador antibot se paga por GB y la captura entera pesa
      // varias veces lo del viewport.
      await consumeService<{ cost: number; data: { ws: string } }>("research.brightdata.browser", {}, { userId: ctx.user.id }, async (r) => {
        v = await browserOnBox(ctx, "open", { url, mobile, screenshot: true, cdp: r.data.ws });
      });
      remoteSessions.add(v!.sessionId);
      if (remoteSessions.size > 500) remoteSessions.delete(remoteSessions.keys().next().value!);
      antibotFailed = null;
      return { v: v! };
    } catch (e) {
      const error = e instanceof QuotaExceededError ? "ya no quedan consultas web para el navegador antibot" : (e as Error).message;
      console.error("[render] antibot", url, error);
      antibotFailed = e instanceof QuotaExceededError ? "no se usó: se acabaron tus consultas web" : /timeout|timed out/i.test(error) ? "no respondió a tiempo" : "no conectó";
      return { error };
    }
  };
  const ANTIBOT_HINT = (id: string) =>
    `Esta página bloquea navegadores automáticos: la abrí por el navegador antibot (sesión ${id}, cuesta ${INTERACT_COST} consultas web). ${DOMAIN_LIMIT_HINT}`;

  const actionSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("click"), ref: z.string().optional(), text: z.string().optional().describe("texto visible, si no tienes ref") }),
    z.object({ type: z.literal("type"), ref: z.string(), text: z.string(), submit: z.boolean().optional().describe("Enter al terminar") }),
    z.object({ type: z.literal("press"), key: z.string().describe("Enter, Tab, Escape, ArrowDown…") }),
    z.object({ type: z.literal("select"), ref: z.string(), value: z.string().describe("etiqueta o valor de la opción") }),
    z.object({ type: z.literal("scroll"), direction: z.enum(["down", "up"]).optional(), amount: z.number().int().min(50).max(5000).optional() }),
    z.object({ type: z.literal("wait"), ms: z.number().int().min(0).max(10000) }),
    z.object({ type: z.literal("goto"), url: z.string().url() }),
    z.object({ type: z.literal("back") }),
  ]);

  tool(
    "browser_open",
    "Abre un navegador REAL (Chromium en tu caja) en una URL pública y lo deja abierto para que sigas actuando con `browser_act`: llenar formularios, buscar, navegar varias páginas, entrar a un sitio que necesita clics. Devuelve `sessionId`. Para sólo LEER una página usa web_fetch; para capturarla, screenshot_url." + BROWSER_RULES,
    {
      url: z.string().url().describe("URL pública (https://…)"),
      mobile: z.boolean().optional().describe("emular celular (390px, touch)"),
      screenshot: z.boolean().optional(),
    },
    async (p) => {
      try {
        if (knownBlocked(p.url)) {
          const r = await antibot(p.url, p.mobile);
          if ("v" in r) return browserReply(r.v, { wanted: p.screenshot, tool: "browser_open", hint: ANTIBOT_HINT(r.v.sessionId) });
          note(`El navegador antibot ${antibotFailed}: lo intento con el navegador normal`, "page");
        }
        const v = await browserOnBox(ctx, "open", { url: p.url, mobile: p.mobile, screenshot: true, fullPage: true });
        if (looksBlocked(v)) {
          learnBlocked(p.url);
          const r = await antibot(p.url, p.mobile, "captcha");
          if ("v" in r) {
            await browserOnBox(ctx, "close", { sessionId: v.sessionId }).catch(() => undefined);
            return browserReply(r.v, { wanted: p.screenshot, tool: "browser_open", hint: ANTIBOT_HINT(r.v.sessionId) });
          }
          return browserReply(v, { wanted: p.screenshot, tool: "browser_open", hint: `La página pide captcha y no se pudo usar el navegador antibot (${r.error}). No lo resuelvas tú: usa web_search/web_fetch o pídele ayuda a la persona.` });
        }
        return browserReply(v, { wanted: p.screenshot, tool: "browser_open", hint: loginHint(v) ?? `Sesión ${v.sessionId} abierta. Actúa con browser_act y ciérrala con browser_close al terminar.` });
      } catch (e) {
        return browserFail(e);
      }
    }
  );

  tool(
    "browser_act",
    "Ejecuta acciones EN ORDEN sobre una sesión de `browser_open` (máx. 25): click (por `ref` o `text`), type (llena un campo; `submit` da Enter), press, select, scroll, wait, goto, back. Se detiene en la primera que falla y devuelve la página como quedó, con `failed` diciendo cuál y por qué." + BROWSER_RULES,
    {
      session_id: z.string().describe("el sessionId de browser_open"),
      actions: z.array(actionSchema).min(1).max(25),
      screenshot: z.boolean().optional(),
    },
    async (p) => {
      try {
        const v = await browserOnBox(ctx, "act", { sessionId: p.session_id, actions: p.actions, screenshot: true, fullPage: true });
        // Una acción que llevó a un muro antibot: se sigue en el navegador antibot desde esa URL.
        if (!remoteSessions.has(p.session_id) && looksBlocked(v) && /^https?:/.test(v.url)) {
          learnBlocked(v.url);
          const r = await antibot(v.url, undefined, "captcha");
          if ("v" in r) {
            await browserOnBox(ctx, "close", { sessionId: p.session_id }).catch(() => undefined);
            return browserReply(r.v, { wanted: p.screenshot, tool: "browser_act", hint: `${ANTIBOT_HINT(r.v.sessionId)} La sesión ${p.session_id} se cerró: sigue con la nueva.` });
          }
        }
        const domainLimit = v.failed && /navigate_domains_limit/.test(v.failed.error);
        return browserReply(v, {
          wanted: p.screenshot,
          tool: "browser_act",
          actions: p.actions,
          hint: domainLimit
            ? DOMAIN_LIMIT_HINT
            : v.failed
              ? `Falló la acción ${v.failed.index + 1}: ${v.failed.error}. La página quedó como se ve.`
              : undefined,
        });
      } catch (e) {
        return browserFail(e);
      }
    }
  );

  tool(
    "browser_look",
    "Vuelve a mirar una sesión abierta sin tocarla (por ejemplo, tras esperar a que algo cargue). `screenshot: true` para verla." + BROWSER_RULES,
    { session_id: z.string(), screenshot: z.boolean().optional() },
    async (p) => {
      try {
        return browserReply(await browserOnBox(ctx, "look", { sessionId: p.session_id, screenshot: true, fullPage: true }), { wanted: p.screenshot, tool: "browser_look" });
      } catch (e) {
        return browserFail(e);
      }
    }
  );

  tool(
    "browser_ask_human",
    "Cuando la página necesita a la persona (iniciar sesión, un captcha, un código de verificación, confirmar un pago, cualquier dato que no debes escribir tú), llama ESTA tool en vez de terminar tu respuesta. La persona ve el aviso con «Tomar el control» en la computadora del agente, lo resuelve en ese mismo navegador y te lo devuelve: la tool regresa `done: true` con la página como quedó y sigues en el mismo turno. Si regresa `waiting: true`, vuélvela a llamar igual para seguir esperando (hasta ~10 min en total). `instructions`: qué tiene que hacer, en una frase corta y clara («Inicia sesión con tu cuenta de Deník»).",
    {
      session_id: z.string().describe("el sessionId de browser_open"),
      instructions: z.string().describe("qué tiene que hacer la persona, en una frase"),
      reason: z.enum(["login", "captcha", "code", "payment", "other"]).optional(),
      screenshot: z.boolean().optional(),
    },
    async (p) => {
      try {
        const sid = p.session_id;
        const instructions = p.instructions.trim().slice(0, 300) || "El agente necesita tu ayuda en esta página.";
        const first = askedAt.get(sid) ?? Date.now();
        askedAt.set(sid, first);
        if (askedAt.size > 200) askedAt.delete(askedAt.keys().next().value!);
        // La captura de ahora con el aviso: el panel enseña «Tomar el control» al frente.
        await browserReply(await browserOnBox(ctx, "look", { sessionId: sid, screenshot: true, fullPage: true }), { tool: "browser_ask_human", needsHuman: instructions });
        const released = await waitForRelease(sid, Math.min(ASK_CHUNK_MS, Math.max(0, first + ASK_TOTAL_MS - Date.now())));
        const v = await browserOnBox(ctx, "look", { sessionId: sid, screenshot: true, fullPage: true });
        if (released || Date.now() - first >= ASK_TOTAL_MS) askedAt.delete(sid);
        if (released) return browserReply(v, { wanted: p.screenshot, tool: "browser_ask_human", extra: { done: true }, hint: "La persona terminó y te devolvió el control. Revisa la página y sigue." });
        if (!askedAt.has(sid)) return browserReply(v, { wanted: p.screenshot, tool: "browser_ask_human", extra: { done: false, reason: "timeout" }, hint: "La persona no respondió en 10 min. Cierra el navegador y dile en tu respuesta qué falta para seguir." });
        return browserReply(v, { wanted: p.screenshot, tool: "browser_ask_human", needsHuman: instructions, extra: { done: false, waiting: true }, hint: "La persona todavía no termina. Vuelve a llamar browser_ask_human con lo mismo para seguir esperando." });
      } catch (e) {
        return browserFail(e);
      }
    }
  );

  tool("browser_close", "Cierra una sesión de navegador cuando terminaste. Libera la caja.", { session_id: z.string() }, async (p) => {
    try {
      askedAt.delete(p.session_id);
      releaseHandoff(p.session_id);
      await browserOnBox(ctx, "close", { sessionId: p.session_id });
      return ok({ closed: true });
    } catch (e) {
      return browserFail(e);
    }
  });

  // `office_to_pdf` (docx/xlsx/pptx → PDF) was removed 2026-08-17: it routed to
  // a LibreOffice endpoint the render-svc box does not serve, so it had never
  // worked. Offering every fleet agent a tool that always fails is worse than
  // not having it. Restore it when the box template gains LibreOffice.

  return server;
}

async function handle(request: Request, fleetAgentId: string): Promise<Response> {
  const url = new URL(request.url);
  // Auth centralizada. El worker presenta un `flt_sk_` con scope; el token legacy
  // sigue valiendo mientras `legacyTokenMode` lo permita.
  let fleetAgent;
  try {
    ({ fleetAgent } = await authFleetAgent(request, fleetAgentId, "MESSAGE"));
  } catch (e) {
    const status = e instanceof Response ? e.status : 401;
    return Response.json({ error: status === 403 ? "Forbidden" : "Unauthorized" }, { status });
  }
  const ctx = await ctxForOwner(fleetAgent.ownerId);
  if (!ctx) return Response.json({ error: "owner not found" }, { status: 401 });

  const groupId = request.headers.get("x-eb-group");
  const server = buildRenderServer(ctx, groupId ? { fleetAgentId: fleetAgent.id, groupId } : undefined);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(request, { authInfo: ctx as any });
}

export async function action({ request, params }: Route.ActionArgs) {
  return handle(request, params.fleetAgentId!);
}

export async function loader({ request, params }: Route.LoaderArgs) {
  return handle(request, params.fleetAgentId!);
}
