/**
 * REST v2 del toolset `web` — misma forma que las tools MCP.
 *
 *   POST /api/v2/web/search   { query, engine?, country? }
 *   POST /api/v2/web/fetch    { url, country?, asMarkdown? }
 *   POST /api/v2/web/extract  { source?, datasetId?, input, limit? } → { jobId, status }
 *   GET  /api/v2/web/extract/:jobId
 *   POST /api/v2/web/crawl    { url, maxPages?, country? }
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
    return Response.json({ error: e.providerMessage, code: e.code }, { status: 502 });
  }
  return null;
}

// GET /api/v2/web/extract/:jobId
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const { op, jobId } = params;
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
  requireScope(ctx, "WRITE");
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const serviceId = OPS[params.op ?? ""];
  if (!serviceId || params.jobId) return Response.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  try {
    const r = await consumeService<
      BrightdataSearchOutput | BrightdataScrapeOutput | BrightdataExtractOutput | BrightdataCrawlOutput
    >(serviceId, body, { userId: ctx.user.id });
    return Response.json(r.data, { status: params.op === "extract" ? 202 : 200 });
  } catch (e) {
    return mapError(e) ?? Response.json({ error: "Internal error" }, { status: 500 });
  }
}
