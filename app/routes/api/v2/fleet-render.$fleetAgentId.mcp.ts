import type { Route } from "./+types/fleet-render.$fleetAgentId.mcp";
import { authFleetAgent } from "~/.server/apiAuth";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { db } from "~/.server/db";
import type { AuthContext } from "~/.server/apiAuth";
import { ok, fail } from "~/.server/mcp/responses";
import { renderViaBoxAndStore, captureScreenshot, auditPage, type RenderOptions } from "~/.server/core/fleetRender";

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

function buildRenderServer(ctx: AuthContext): McpServer {
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

  const server = buildRenderServer(ctx);
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
