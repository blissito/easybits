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
import { startRemoveBackground, removeBackgroundStatus, type RemoveBackgroundStatus } from "~/.server/core/fleetVideo";
import { browserOnBox, BrowserSessionGone, type BrowserAction, type BrowserView } from "~/.server/core/renderClient";
import { hasLiveTurn, pushBrowserFrame } from "~/.server/core/siteTurns.server";
import { getPlatformPublicClient, buildPublicAssetUrl } from "~/.server/storage";
import { randomUUID } from "node:crypto";

// Dedicated, always-on `render` MCP server for FleetAgents — Streamable-HTTP.
// Injected per-turn into EVERY fleet agent (NOT gated by the easybits builtin
// toggle), so the agent can make PDFs/screenshots even with the EasyBits MCP off
// in the group. Auth = the fleetAgent's bearer token (header or ?token=), which
// resolves to the owner's AuthContext for ensureServiceBox + Files upload.
//
// Mirrors handler.ts (the /api/mcp Streamable-HTTP setup) but with a tiny tool
// surface and fleetAgent-token auth instead of an API key.

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

  // ── Quitar fondo (BiRefNet en la caja de video) ──
  // Asíncrono: una imagen tarda ~30 s (cabe esperando aquí), un video minutos u horas.
  const bgHint = (r: RemoveBackgroundStatus) =>
    r.state === "done"
      ? "Listo. Manda `url` como ADJUNTO; ya está en Files del owner."
      : r.state === "failed"
        ? `Falló: ${r.error ?? "sin detalle"}`
        : `Sigue en proceso (${r.step ?? r.state}). Avísale a la persona y consulta con remove_background_status({job_id: "${r.jobId}"}) en otro turno; no te quedes en un bucle.`;

  tool(
    "remove_background",
    "QUITA EL FONDO de una imagen o un video con BiRefNet (sirve con personajes, sprites, productos y personas, no sólo gente). Devuelve un PNG con alfa (imagen) o un MOV ProRes 4444 con alfa / un .zip de PNGs (video), guardado en Files del owner como { fileId, url }.\n\n- Entrada: `file_id` (de Files) o `url` https pública.\n- Es LENTO: ~22 s por cuadro. Una imagen suele quedar dentro de esta llamada (espera hasta `wait_seconds`). Un video son ~22 s × cuadros (10 s a 30 fps ≈ 2 h): devuelve `job_id` y lo consultas con `remove_background_status` en otro turno.\n- Tope: 300 cuadros por video. Para bajar el costo usa `fps` (un sprite a 12 fps se ve bien) o recorta con `start`/`duration`; si te pasas, el error te dice cuántos cuadros son.\n- MOV ProRes pesa mucho (cientos de MB por minuto); `png-zip` si lo van a editar cuadro por cuadro.\n- Gratis, no consume créditos.",
    {
      file_id: z.string().optional().describe("archivo de Files (imagen o video)"),
      url: z.string().url().optional().describe("URL https pública de la imagen o el video"),
      format: z.enum(["png", "mov", "png-zip"]).optional().describe("imagen → png; video → mov (default) o png-zip"),
      fps: z.number().min(1).max(60).optional().describe("video: cuadros por segundo a procesar"),
      start: z.number().min(0).optional().describe("video: segundo de inicio"),
      duration: z.number().positive().optional().describe("video: duración del tramo en segundos"),
      keep_audio: z.boolean().optional().describe("video → mov: conservar el audio (default true)"),
      file_name: z.string().max(120).optional().describe("nombre base del archivo de salida"),
      wait_seconds: z.number().int().min(0).max(50).optional().describe("cuánto esperar el resultado aquí antes de devolver job_id. Default 45."),
    },
    async (p) => {
      try {
        if (!p.file_id && !p.url) return fail("Pasa `file_id` o `url`.");
        const { jobId } = await startRemoveBackground(ctx, {
          fileId: p.file_id,
          url: p.url,
          format: p.format,
          fps: p.fps,
          start: p.start,
          duration: p.duration,
          keepAudio: p.keep_audio,
          fileName: p.file_name,
        });
        const deadline = Date.now() + (p.wait_seconds ?? 45) * 1000;
        let r: RemoveBackgroundStatus = { jobId, state: "queued" };
        while (Date.now() < deadline) {
          await new Promise((res) => setTimeout(res, 3000));
          r = await removeBackgroundStatus(ctx, jobId);
          if (r.state === "done" || r.state === "failed") break;
        }
        if (r.state === "failed") return fail(bgHint(r));
        return ok({ ...r, job_id: jobId, hint: bgHint(r) });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  tool(
    "remove_background_status",
    "Estado de un `remove_background` que no terminó en su llamada. `done` trae { fileId, url } (ya en Files: mándalo como ADJUNTO); `running` trae `step` con el avance y los minutos estimados.",
    { job_id: z.string().describe("el job_id `bg_…` que devolvió remove_background") },
    async (p) => {
      try {
        const r = await removeBackgroundStatus(ctx, p.job_id);
        if (r.state === "failed") return fail(bgHint(r));
        return ok({ ...r, hint: bgHint(r) });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  // ── Navegador con estado (nivel 1 de computer use) ──
  // La página sigue viva entre llamadas en la caja de render del owner. El agente apunta
  // por `ref` (de `elements`), no por coordenadas, y pide captura sólo cuando la necesita.
  const BROWSER_RULES =
    "\n\n- Cada respuesta trae `url`, `title`, `text` (texto visible) y `elements`: lo que se puede tocar, con su `ref`. Los `ref` cambian tras cada acción: usa los de la ÚLTIMA respuesta." +
    "\n- `screenshot: true` añade la captura del viewport como imagen. Pídela sólo cuando el texto no baste (diseño, CAPTCHA, imágenes): pesa en tu contexto." +
    "\n- La sesión dura ~3 min sin uso. Si responde que ya no existe, abre otra." +
    "\n- Sólo URLs públicas. No escribas contraseñas, tarjetas ni datos sensibles, ni resuelvas CAPTCHAs: pídeselo a la persona.";

  // La caja SIEMPRE manda captura: el panel «la computadora del agente» la necesita. Al modelo
  // sólo le llega si la pidió (pesa en su contexto).
  const browserReply = async (v: BrowserView, opts: { wanted?: boolean; hint?: string; tool: string; actions?: BrowserAction[] }) => {
    const { screenshot, ...rest } = v;
    const names = lastNames.get(v.sessionId);
    if (panel && screenshot && hasLiveTurn(panel.fleetAgentId, panel.groupId)) {
      try {
        const key = `agent-frames/${randomUUID()}.jpg`;
        await getPlatformPublicClient().putObject(key, Buffer.from(screenshot, "base64"), "image/jpeg");
        pushBrowserFrame(panel.fleetAgentId, panel.groupId, {
          url: v.url,
          title: v.title,
          image: buildPublicAssetUrl(key),
          viewport: v.viewport ?? undefined,
          target: v.target ?? undefined,
          action: v.failed ? `Falló: ${v.failed.error}` : actionLabel(opts.actions, names ?? new Map()),
          sessionId: v.sessionId,
        }, opts.tool);
      } catch (e) {
        console.error("[render] frame del panel", (e as Error).message);
      }
    }
    lastNames.set(v.sessionId, new Map(v.elements.map((e) => [e.ref, e.name])));
    if (lastNames.size > 200) lastNames.delete(lastNames.keys().next().value!);
    const r = ok({ ...rest, ...(opts.hint ? { hint: opts.hint } : {}) }) as { content: unknown[] };
    if (screenshot && opts.wanted) r.content.push({ type: "image", data: screenshot, mimeType: "image/jpeg" });
    return r;
  };
  const browserFail = (e: unknown) => fail(e instanceof BrowserSessionGone ? e.message : (e as Error).message);

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
        const v = await browserOnBox(ctx, "open", { url: p.url, mobile: p.mobile, screenshot: true });
        return browserReply(v, { wanted: p.screenshot, tool: "browser_open", hint: `Sesión ${v.sessionId} abierta. Actúa con browser_act y ciérrala con browser_close al terminar.` });
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
        const v = await browserOnBox(ctx, "act", { sessionId: p.session_id, actions: p.actions, screenshot: true });
        return browserReply(v, {
          wanted: p.screenshot,
          tool: "browser_act",
          actions: p.actions,
          hint: v.failed ? `Falló la acción ${v.failed.index + 1}: ${v.failed.error}. La página quedó como se ve.` : undefined,
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
        return browserReply(await browserOnBox(ctx, "look", { sessionId: p.session_id, screenshot: true }), { wanted: p.screenshot, tool: "browser_look" });
      } catch (e) {
        return browserFail(e);
      }
    }
  );

  tool("browser_close", "Cierra una sesión de navegador cuando terminaste. Libera la caja.", { session_id: z.string() }, async (p) => {
    try {
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
