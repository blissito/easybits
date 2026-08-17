import type { Route } from "./+types/fleet-render.$fleetAgentId.mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { db } from "~/.server/db";
import type { AuthContext } from "~/.server/apiAuth";
import { ok, fail } from "~/.server/mcp/responses";
import { renderViaBoxAndStore, captureScreenshot, BOX_HONORS_WAIT, type RenderOptions } from "~/.server/core/fleetRender";

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
    "NO DISPONIBLE todavía: la caja de render de esta cuenta aún no navega URLs. Usa `render_html` pasando el HTML completo. (Se habilitará cuando el template de la caja gane navegación; la firma no va a cambiar.)",
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
        return fail((e as Error).message, { retryable: false, useInstead: "render_html" });
      }
    }
  );

  tool(
    "render_html",
    "Renderiza HTML auto-contenido a PDF o PNG con la caja de render on-demand (Chromium). El HTML debe traer su CSS inline (un CDN también sirve, pero ojo: la caja captura al `load` y NO espera, así que un CSS que llega tarde sale sin aplicar — inline es más seguro). Devuelve { fileId, url } — mándala al chat como ADJUNTO. Para facturas/cotizaciones/reportes estructurados usa structured_doc, NO esto.",
    {
      html: z.string().describe("HTML completo y auto-contenido"),
      format: z.enum(["pdf", "png"]).default("pdf"),
      full_page: z.boolean().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      landscape: z.boolean().optional(),
      paper: z.enum(["letter", "a4", "legal"]).optional(),
      wait_ms: z.number().optional().describe("aceptado pero AÚN NO honrado por la caja (captura al load)"),
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
        // Never let the agent believe a wait happened that didn't.
        return ok({ ...r, ...(p.wait_ms ? { waitHonored: BOX_HONORS_WAIT } : {}) });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  tool(
    "screenshot_url",
    "VE cómo se ve una página. Renderiza HTML auto-contenido en un Chromium real y devuelve { fileId, url } de la imagen. Úsala para VERIFICAR tu propio trabajo: captura → mírala con `see_image` → corrige → repite.\n\n- `html` es lo normal aquí: te deja revisar un borrador SIN publicarlo.\n- `preset`: 'mobile' (390px, DEFAULT — el peor caso, donde se rompen las landings) o 'desktop' (1440px).\n- ⚠️ La caja captura al `load` y NO ESPERA: si el HTML trae Tailwind por CDN saldrá SIN estilos. Inline el CSS antes.\n- ⚠️ 'mobile' es ANCHO de viewport, no emulación de dispositivo (`mobileEmulation:false`).\n- Si sale de un solo color, la respuesta trae `warning`: significa que el CSS no había pintado, NO que rompiste la página.\n- Gratis, no consume créditos.",
    {
      html: z.string().max(2_000_000).optional().describe("HTML completo y auto-contenido. GANA sobre url."),
      url: z.string().url().optional().describe("URL pública (aún no soportada por la caja)."),
      preset: z.enum(["mobile", "desktop"]).optional().describe("mobile = 390x844 (default). desktop = 1440x900."),
      viewport: z.object({ width: z.number().int().min(240).max(3840), height: z.number().int().min(320).max(4000) }).optional(),
      full_page: z.boolean().optional().describe("Página completa scrolleable. Default true."),
      wait_ms: z.number().int().min(0).max(30000).optional().describe("Aceptado, pero la caja aún NO lo honra."),
      file_name: z.string().max(120).optional(),
    },
    async (p) => {
      try {
        const r = await captureScreenshot(ctx, {
          html: p.html,
          url: p.url,
          preset: p.preset,
          viewport: p.viewport,
          fullPage: p.full_page,
          waitMs: p.wait_ms,
          fileName: p.file_name,
        });
        return ok({
          ...r,
          hint: r.warning
            ? `Captura lista PERO ${r.warning}`
            : `Captura ${r.preset} lista (${r.width}x${r.height}). Mírala con see_image({imageUrl}) antes de decir que quedó bien.`,
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
  const bearer =
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token") ||
    "";
  const fleetAgent = await db.fleetAgent.findUnique({ where: { id: fleetAgentId } });
  if (!fleetAgent || !bearer || fleetAgent.token !== bearer) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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
