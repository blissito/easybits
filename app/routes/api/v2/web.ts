/**
 * REST v2 del toolset `web` — misma forma que las tools MCP.
 *
 *   POST /api/v2/web/search   { query, engine?, country? }
 *   POST /api/v2/web/fetch    { url, country?, asMarkdown? }
 *   POST /api/v2/web/extract  { source?, datasetId?, input, limit? } → { jobId, status }
 *                             { url, schema, prompt? } → 200 { data } (cualquier página, síncrono)
 *   GET  /api/v2/web/extract/:jobId
 *   POST /api/v2/web/crawl    { url, maxPages?, country? }   maxPages > 20 → 202 { jobId } (segundo plano)
 *   GET  /api/v2/web/crawl/:jobId?cursor=N                   estado + un bloque de páginas
 *   POST /api/v2/web/monitor  { url, everyMinutes? }  · GET /api/v2/web/monitor · DELETE /api/v2/web/monitor/:id
 *   POST /api/v2/web/map      { url, search?, limit? }   → todas las URLs del sitio, sin leerlas
 *   POST /api/v2/web/interact { url, actions[], screenshot? } → navegador remoto: clics/escribir/scroll
 *
 * Se mide en consultas (`User.webQueriesBonus`); sin saldo → 402.
 */
import type { Route } from "./+types/web";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { consumeService } from "~/.server/services/consume";
import { QuotaExceededError, ServiceConfigError, ServiceProviderError } from "~/.server/services/errors";
import type {
  BrightdataCrawlOutput,
  BrightdataExtractOutput,
  BrightdataExtractStatusOutput,
  BrightdataScrapeOutput,
  BrightdataSearchOutput,
} from "~/.server/services/providers/brightdata";

const OPS: Record<string, string> = {
  search: "research.brightdata.search",
  fetch: "research.brightdata.scrape",
  extract: "research.brightdata.extract",
  crawl: "research.brightdata.crawl",
  map: "research.brightdata.map",
  interact: "research.brightdata.interact",
};

// URL ABSOLUTA: el cliente puede ser un agente en un chat, donde "/dash/packs"
// no es clickeable ni resoluble. Misma constante que app/.server/mcp/responses.ts.
const APP_URL = process.env.APP_URL || "https://www.easybits.cloud";

function mapError(e: unknown): Response | null {
  if (e instanceof QuotaExceededError) {
    return Response.json(
      { error: "Sin consultas web", code: e.code, requiredCost: e.requiredCost, available: e.available, buy: `${APP_URL}/dash/packs?tab=web` },
      { status: 402 },
    );
  }
  if (e instanceof ServiceConfigError) return Response.json({ error: "Servicio no configurado", code: e.code }, { status: 503 });
  if (e instanceof ServiceProviderError) {
    // Cooldown de Brightdata sobre esa query (failed_query_rejected): es
    // temporal y reintentable — un 502 haría creer al cliente que se rompió.
    if (e.providerStatus === 429) {
      return Response.json(
        { error: e.providerMessage, code: "UPSTREAM_COOLDOWN", retryAfter: 60 },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }
    // 400/404 son del cliente (input malo, jobId o fetchId que no existe): no son caídas.
    const status = [400, 404, 422].includes(e.providerStatus ?? 0) ? e.providerStatus! : 502;
    return Response.json({ error: e.providerMessage, code: e.code }, { status });
  }
  return null;
}

// GET /api/v2/web/extract/:jobId · GET /api/v2/web/crawl/:jobId?cursor=N · GET /api/v2/web/monitor
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const { op, jobId } = params;
  if (op === "monitor" && !jobId) {
    const { listMonitors } = await import("~/.server/core/webMonitors");
    const items = await listMonitors(ctx.user.id);
    return Response.json({ items, nextCursor: null, hasMore: false, total: items.length });
  }
  if (op === "crawl" && jobId) {
    const { readCrawlJob } = await import("~/.server/core/webCrawlJobs");
    const cursor = Number(new URL(request.url).searchParams.get("cursor") ?? 0) || 0;
    const r = await readCrawlJob(ctx.user.id, jobId, cursor);
    return r ? Response.json(r) : Response.json({ error: "job not found" }, { status: 404 });
  }
  if (op !== "extract" || !jobId) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const r = await consumeService<BrightdataExtractStatusOutput>(
      "research.brightdata.extractStatus",
      { jobId },
      { userId: ctx.user.id },
    );
    return Response.json(r.data);
  } catch (e) {
    return mapError(e) ?? Response.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST /api/v2/web/:op
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  // Monitores: POST /web/monitor { url, everyMinutes? } · DELETE /web/monitor/:id
  if (params.op === "monitor") {
    const mon = await import("~/.server/core/webMonitors");
    if (request.method === "DELETE" && params.jobId) {
      requireScope(ctx, "DELETE");
      const ok = await mon.deleteMonitor(ctx.user.id, params.jobId);
      return ok ? Response.json({ deleted: true }) : Response.json({ error: "monitor not found" }, { status: 404 });
    }
    if (request.method !== "POST" || params.jobId) return Response.json({ error: "Method not allowed" }, { status: 405 });
    requireScope(ctx, "WRITE");
    const body = (await request.json().catch(() => ({}))) as { url?: string; everyMinutes?: number };
    if (!body.url) return Response.json({ error: "url is required" }, { status: 400 });
    const { checkWebQuota } = await import("~/.server/webQuota");
    if ((await checkWebQuota(ctx.user.id)).available < 1) {
      return Response.json({ error: "Sin consultas web", code: "QUOTA_EXCEEDED", buy: `${APP_URL}/dash/packs?tab=web` }, { status: 402 });
    }
    try {
      return Response.json(await mon.createMonitor(ctx.user.id, { url: body.url, everyMinutes: body.everyMinutes }), { status: 201 });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
  }

  requireScope(ctx, "WRITE");
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const serviceId = OPS[params.op ?? ""];
  if (!serviceId || params.jobId) return Response.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  try {
    const r = await consumeService<
      BrightdataSearchOutput | BrightdataScrapeOutput | BrightdataExtractOutput | BrightdataCrawlOutput
    >(serviceId, body, { userId: ctx.user.id });
    // 202 = quedó corriendo (extract de fuente, rastreo grande); lo síncrono responde 200.
    const d = r.data as { status?: string; jobId?: string };
    const accepted = (params.op === "extract" && d.status === "running") || (params.op === "crawl" && !!d.jobId);
    return Response.json(r.data, { status: accepted ? 202 : 200 });
  } catch (e) {
    return mapError(e) ?? Response.json({ error: "Internal error" }, { status: 500 });
  }
}
