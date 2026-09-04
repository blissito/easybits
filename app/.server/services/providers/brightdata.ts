/**
 * Brightdata adapter — Web Unlocker + SERP API.
 *
 * Both products share a single REST endpoint (`POST https://api.brightdata.com/request`)
 * differentiated by `zone`. Same Bearer token. Returns `{status_code, headers, body}`
 * where `body` is HTML (format=raw) or structured JSON / markdown (format=json with
 * data_format=markdown).
 *
 * Pricing: per GB of bandwidth (request + response). For our purposes — average web
 * page ~50-200KB — 1 request ≈ 1 crédito is a clean approximation. SERP responses are
 * larger (often 200KB-1MB) → 2 créditos per search.
 *
 * Env:
 *   BRIGHTDATA_API_TOKEN  (also accepts BRIGHTDATA_API_KEY)  — Bearer token
 *   BRIGHTDATA_UNLOCKER_ZONE  (default: "mcp_unlocker")
 *   BRIGHTDATA_SERP_ZONE      (default: "serp_api_for_maps")
 *
 * Docs: https://docs.brightdata.com/api-reference/rest-api/unlocker/unlock-website
 *       https://docs.brightdata.com/api-reference/rest-api/serp/serp-api
 */
import { ServiceConfigError, ServiceProviderError } from "../errors";
import type { ServiceDef, ServiceResult } from "../types";

const BRIGHTDATA_URL = "https://api.brightdata.com/request";

function getApiKey(): string {
  const key = process.env.BRIGHTDATA_API_TOKEN || process.env.BRIGHTDATA_API_KEY;
  if (!key) {
    throw new ServiceConfigError("research.brightdata", "BRIGHTDATA_API_TOKEN");
  }
  return key;
}

interface BrightdataResponse {
  status_code?: number;
  headers?: Record<string, unknown>;
  body?: string;
}

interface BrightdataRequestInput {
  zone: string;
  url: string;
  format: "raw" | "json";
  country?: string;
  data_format?: "markdown" | "screenshot";
  serviceId: string; // for error tagging
}

async function brightdataRequest(input: BrightdataRequestInput): Promise<BrightdataResponse | string> {
  const apiKey = getApiKey();
  const body: Record<string, unknown> = {
    zone: input.zone,
    url: input.url,
    format: input.format,
  };
  if (input.country) body.country = input.country;
  if (input.data_format) body.data_format = input.data_format;

  const res = await fetch(BRIGHTDATA_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new ServiceProviderError(input.serviceId, res.status, `Brightdata: ${text.slice(0, 300)}`);
  }
  // format=raw → HTML body directly. format=json → JSON envelope.
  if (input.format === "raw") return text;
  try {
    return JSON.parse(text) as BrightdataResponse;
  } catch {
    throw new ServiceProviderError(input.serviceId, res.status, `Brightdata: invalid JSON response`);
  }
}

/* ────────────────────────────────────────────────────────────────────── */
/* SCRAPE — Web Unlocker                                                  */
/* ────────────────────────────────────────────────────────────────────── */

export interface BrightdataScrapeInput {
  /** Target URL to fetch (full https://...). */
  url: string;
  /** ISO 3166-1 country code (us, mx, gb...). Default unset. */
  country?: string;
  /** If true, returns markdown instead of raw HTML. Default false (raw HTML). */
  asMarkdown?: boolean;
  /** Override Unlocker zone. Default from env BRIGHTDATA_UNLOCKER_ZONE. */
  zone?: string;
}

export interface BrightdataScrapeOutput extends ServiceResult {
  data: {
    url: string;
    statusCode: number;
    body: string; // HTML or markdown (truncated for safety)
    format: "raw" | "markdown";
  };
}

const SCRAPE_BODY_MAX_LEN = 200_000; // 200KB cap to avoid blowing up MCP responses

export const brightdataScrapeService: ServiceDef<BrightdataScrapeInput, BrightdataScrapeOutput> = {
  id: "research.brightdata.scrape",
  product: "research",
  displayName: "Web Scrape (Brightdata Unlocker)",
  description:
    "Fetches a single web page via Brightdata Web Unlocker. Bypasses bot detection, returns HTML or markdown.",
  estimateCost(_input) {
    return 1; // 1 crédito per page — pricing is per-GB internally, average page fits.
  },
  async execute(input) {
    const url = input.url?.trim();
    if (!url) {
      throw new ServiceProviderError("research.brightdata.scrape", 400, "url is required");
    }
    const zone = input.zone || process.env.BRIGHTDATA_UNLOCKER_ZONE || "mcp_unlocker";
    const wantMarkdown = !!input.asMarkdown;

    if (wantMarkdown) {
      const resp = (await brightdataRequest({
        zone,
        url,
        format: "json",
        country: input.country,
        data_format: "markdown",
        serviceId: "research.brightdata.scrape",
      })) as BrightdataResponse;
      const body = (resp.body ?? "").slice(0, SCRAPE_BODY_MAX_LEN);
      return {
        data: {
          url,
          statusCode: resp.status_code ?? 200,
          body,
          format: "markdown",
        },
      };
    }
    const html = (await brightdataRequest({
      zone,
      url,
      format: "raw",
      country: input.country,
      serviceId: "research.brightdata.scrape",
    })) as string;
    return {
      data: {
        url,
        statusCode: 200,
        body: html.slice(0, SCRAPE_BODY_MAX_LEN),
        format: "raw",
      },
    };
  },
};

/* ────────────────────────────────────────────────────────────────────── */
/* SEARCH — SERP API                                                      */
/* ────────────────────────────────────────────────────────────────────── */

export interface BrightdataSearchInput {
  /** Search query. Required. */
  query: string;
  /** Search engine. Default google. */
  engine?: "google" | "bing" | "yandex" | "duckduckgo";
  /** ISO 3166-1 country code for localized results. Default unset (US). */
  country?: string;
  /** Override SERP zone. Default from env BRIGHTDATA_SERP_ZONE. */
  zone?: string;
}

export interface BrightdataSearchOutput extends ServiceResult {
  data: {
    query: string;
    engine: string;
    /** Parsed structured results from Brightdata SERP API (organic, snack_pack, etc.). */
    results: unknown;
  };
}

// `brd_json=1` pide al proveedor el SERP ya parseado (organic[], snack_pack,
// knowledge…). Sin él devuelve el HTML de Google y `results` queda inútil.
function buildSearchUrl(query: string, engine: string, country?: string): string {
  const q = encodeURIComponent(query);
  const geo = country ? `&gl=${country.toLowerCase()}` : "";
  switch (engine) {
    case "bing":
      return `https://www.bing.com/search?q=${q}&brd_json=1`;
    case "yandex":
      return `https://yandex.com/search/?text=${q}&brd_json=1`;
    case "duckduckgo":
      return `https://duckduckgo.com/?q=${q}&brd_json=1`;
    case "google":
    default:
      return `https://www.google.com/search?q=${q}${geo}&brd_json=1`;
  }
}

export const brightdataSearchService: ServiceDef<BrightdataSearchInput, BrightdataSearchOutput> = {
  id: "research.brightdata.search",
  product: "research",
  displayName: "Search Engine Results (Brightdata SERP)",
  description:
    "Runs a search query (Google/Bing/Yandex/DuckDuckGo) via Brightdata SERP API and returns structured organic results.",
  estimateCost(_input) {
    return 2; // SERP responses are larger than single pages.
  },
  async execute(input) {
    const query = input.query?.trim();
    if (!query) {
      throw new ServiceProviderError("research.brightdata.search", 400, "query is required");
    }
    const engine = input.engine ?? "google";
    const zone = input.zone || process.env.BRIGHTDATA_SERP_ZONE || "serp_api_for_maps";
    const url = buildSearchUrl(query, engine, input.country);

    const resp = (await brightdataRequest({
      zone,
      url,
      format: "json",
      country: input.country,
      serviceId: "research.brightdata.search",
    })) as BrightdataResponse;

    // Brightdata returns the parsed SERP structure inside `body` (sometimes as
    // a JSON string when the upstream renders structured data). Try to parse;
    // if it's already an object, use it as-is.
    let results: unknown = resp.body ?? null;
    if (typeof results === "string") {
      try {
        results = JSON.parse(results);
      } catch {
        // leave as string — caller can still consume it
      }
    }

    return {
      data: {
        query,
        engine,
        results,
      },
    };
  },
};

/* ────────────────────────────────────────────────────────────────────── */
/* EXTRACT — Web Scraper API (datasets con esquema) + parsers propios     */
/* ────────────────────────────────────────────────────────────────────── */

const DATASETS_URL = "https://api.brightdata.com/datasets/v3";

/**
 * Fuentes curadas → dataset del proveedor. `discover` = la fuente busca por
 * keyword (descubre registros nuevos); sin `discover` = cada input es una URL
 * (`collect_by_url`). Cualquier otro dataset entra por `datasetId` directo.
 * Verificado 2026-09-04: google_maps con {keyword,country} → 5 registros en 95 s.
 */
export const EXTRACT_SOURCES: Record<
  string,
  { datasetId: string; discover?: { by: string }; inputHint: string }
> = {
  google_maps: { datasetId: "gd_m8ebnr0q2qlklc02fz", discover: { by: "location" }, inputHint: "{ keyword: 'dentista Polanco CDMX', country: 'MX' }" },
  google_maps_reviews: { datasetId: "gd_luzfs1dn2oa0teb81", inputHint: "{ url: 'https://www.google.com/maps/place/…' }" },
  google_shopping: { datasetId: "gd_ltppk50q18kdw67omz", inputHint: "{ url: 'https://shopping.google.com/product/…' }" },
  instagram_profiles: { datasetId: "gd_l1vikfch901nx3by4", inputHint: "{ url: 'https://www.instagram.com/<user>/' }" },
  instagram_posts: { datasetId: "gd_lk5ns7kz21pck8jpis", inputHint: "{ url: 'https://www.instagram.com/p/<id>/' }" },
  tiktok_profiles: { datasetId: "gd_l1villgoiiidt09ci", inputHint: "{ url: 'https://www.tiktok.com/@<user>' }" },
  tiktok_posts: { datasetId: "gd_lu702nij2f790tmv9h", inputHint: "{ url: 'https://www.tiktok.com/@<user>/video/<id>' }" },
  facebook_page_posts: { datasetId: "gd_lkaxegm826bjpoo9m5", inputHint: "{ url: 'https://www.facebook.com/<page>' }" },
  facebook_marketplace: { datasetId: "gd_lvt9iwuh6fbcwmx1a", inputHint: "{ url: 'https://www.facebook.com/marketplace/item/<id>' }" },
  youtube_channels: { datasetId: "gd_lk538t2k2p1k3oos71", inputHint: "{ url: 'https://www.youtube.com/@<channel>' }" },
  youtube_videos: { datasetId: "gd_lk56epmy2i5g7lzu0k", inputHint: "{ url: 'https://www.youtube.com/watch?v=<id>' }" },
  linkedin_company: { datasetId: "gd_l1vikfnt1wgvvqz95w", inputHint: "{ url: 'https://www.linkedin.com/company/<slug>' }" },
  linkedin_person: { datasetId: "gd_l1viktl72bvl7bjuj0", inputHint: "{ url: 'https://www.linkedin.com/in/<slug>' }" },
  linkedin_jobs: { datasetId: "gd_lpfll7v5hcqtkxl6l", inputHint: "{ url: 'https://www.linkedin.com/jobs/view/<id>' }" },
  amazon_product: { datasetId: "gd_l7q7dkf244hwjntr0", inputHint: "{ url: 'https://www.amazon.com.mx/dp/<ASIN>' }" },
  amazon_reviews: { datasetId: "gd_le8e811kzy4ggddlq", inputHint: "{ url: 'https://www.amazon.com.mx/dp/<ASIN>' }" },
  indeed_jobs: { datasetId: "gd_l4dx9j9sscpvs7no2", inputHint: "{ url: 'https://mx.indeed.com/viewjob?jk=<id>' }" },
  trustpilot: { datasetId: "gd_lm5zmhwd2sni130p", inputHint: "{ url: 'https://www.trustpilot.com/review/<domain>' }" },
  inmuebles24: { datasetId: "gd_lfsa1vgv183347v45m", inputHint: "{ url: 'https://www.inmuebles24.com/propiedades/…' }" },
  reddit_posts: { datasetId: "gd_lvz8ah06191smkebj4", inputHint: "{ url: 'https://www.reddit.com/r/<sub>/comments/<id>/…' }" },
  // Parser propio (sin dataset): se resuelve en la misma llamada.
  mercadolibre: { datasetId: "", inputHint: "{ query: 'iphone 15' } o { query, page: 2 }" },
};

async function datasetsRequest(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${DATASETS_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new ServiceProviderError("research.brightdata.extract", res.status, text.slice(0, 300));
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ServiceProviderError("research.brightdata.extract", res.status, "invalid JSON from datasets API");
  }
}

export interface BrightdataExtractInput {
  /** Fuente curada (ver EXTRACT_SOURCES) o "mercadolibre". */
  source?: string;
  /** Dataset del proveedor directo (cualquiera del catálogo), si no hay `source`. */
  datasetId?: string;
  /** Inputs según la fuente: [{url}] o [{keyword,country}] o {query} para mercadolibre. */
  input: Record<string, unknown> | Record<string, unknown>[];
  /** Tope de registros por input (fuentes discover). Default 20, máx 200. */
  limit?: number;
}

export interface BrightdataExtractOutput extends ServiceResult {
  data: {
    jobId: string;
    status: "running" | "done";
    source: string;
    /** Sólo cuando status=done (parsers síncronos, p. ej. mercadolibre). */
    records?: unknown[];
    total?: number;
  };
}

const EXTRACT_DEFAULT_LIMIT = 20;
const EXTRACT_MAX_LIMIT = 200;

export const brightdataExtractService: ServiceDef<BrightdataExtractInput, BrightdataExtractOutput> = {
  id: "research.brightdata.extract",
  product: "research",
  displayName: "Web Extract (datos con esquema)",
  description:
    "Extrae registros estructurados de una fuente conocida (Google Maps, Instagram, Amazon, Mercado Libre…). Async: devuelve jobId; se cobra por registro al recoger.",
  estimateCost(input) {
    // Pre-check con el tope pedido; el cobro real ocurre en extractStatus con
    // los registros devueltos (o aquí mismo para parsers síncronos).
    const inputs = Array.isArray(input.input) ? input.input.length : 1;
    return Math.min(EXTRACT_MAX_LIMIT, input.limit ?? EXTRACT_DEFAULT_LIMIT) * Math.max(1, inputs);
  },
  async execute(input, ctx) {
    const { db } = await import("../../db");
    const source = input.source?.trim();
    const limit = Math.min(EXTRACT_MAX_LIMIT, Math.max(1, input.limit ?? EXTRACT_DEFAULT_LIMIT));
    const inputs = Array.isArray(input.input) ? input.input : [input.input];
    if (!inputs.length) {
      throw new ServiceProviderError("research.brightdata.extract", 400, "input is required");
    }

    // ── Mercado Libre: parser propio, síncrono, 1 página = hasta 48 productos ──
    if (source === "mercadolibre") {
      const { parseMercadoLibreListing, mercadoLibreListingUrl } = await import("./parsers/mercadolibre");
      const zone = process.env.BRIGHTDATA_UNLOCKER_ZONE || "mcp_unlocker";
      const records: unknown[] = [];
      for (const one of inputs) {
        const query = String(one.query ?? one.keyword ?? "").trim();
        if (!query) throw new ServiceProviderError("research.brightdata.extract", 400, "mercadolibre: input.query is required");
        const page = Math.max(1, Number(one.page ?? 1));
        const html = (await brightdataRequest({
          zone,
          url: mercadoLibreListingUrl(query, page),
          format: "raw",
          country: "mx",
          serviceId: "research.brightdata.extract",
        })) as string;
        records.push(...parseMercadoLibreListing(html).slice(0, limit));
      }
      const job = await db.webJob.create({
        data: { userId: ctx.userId, kind: "extract", source, status: "done", records: records.length, charged: true },
      });
      return {
        cost: Math.max(1, records.length),
        data: { jobId: job.id, status: "done", source, records, total: records.length },
      };
    }

    // ── Datasets del proveedor (async) ──
    const curated = source ? EXTRACT_SOURCES[source] : undefined;
    const datasetId = curated?.datasetId || input.datasetId?.trim();
    if (!datasetId) {
      throw new ServiceProviderError(
        "research.brightdata.extract",
        400,
        `Fuente desconocida. Usa una de: ${Object.keys(EXTRACT_SOURCES).join(", ")} — o pasa datasetId.`,
      );
    }
    const params = new URLSearchParams({ dataset_id: datasetId, include_errors: "true" });
    if (curated?.discover) {
      params.set("type", "discover_new");
      params.set("discover_by", curated.discover.by);
      params.set("limit_per_input", String(limit));
    }
    const trig = (await datasetsRequest(`/trigger?${params}`, {
      method: "POST",
      body: JSON.stringify(inputs),
    })) as { snapshot_id?: string };
    if (!trig.snapshot_id) {
      throw new ServiceProviderError("research.brightdata.extract", 502, "provider returned no snapshot_id");
    }
    const job = await db.webJob.create({
      data: { userId: ctx.userId, kind: "extract", source: source ?? datasetId, providerRef: trig.snapshot_id, status: "running" },
    });
    // El trigger no cobra: el cobro es por registro devuelto, en extractStatus.
    return { cost: 0, data: { jobId: job.id, status: "running", source: source ?? datasetId } };
  },
};

export interface BrightdataExtractStatusInput {
  jobId: string;
}

export interface BrightdataExtractStatusOutput extends ServiceResult {
  data: {
    jobId: string;
    status: "running" | "done" | "error";
    source: string;
    records?: unknown[];
    total?: number;
    error?: string;
  };
}

export const brightdataExtractStatusService: ServiceDef<BrightdataExtractStatusInput, BrightdataExtractStatusOutput> = {
  id: "research.brightdata.extractStatus",
  product: "research",
  displayName: "Web Extract — estado",
  description: "Consulta un job de extract; cuando está listo devuelve los registros y cobra 1 consulta por registro (una sola vez).",
  estimateCost() {
    return 1; // pre-check mínimo; el cobro real es records.length o 0
  },
  async execute(input, ctx) {
    const { db } = await import("../../db");
    const job = await db.webJob.findFirst({ where: { id: input.jobId, userId: ctx.userId } });
    if (!job) throw new ServiceProviderError("research.brightdata.extractStatus", 404, "job not found");
    if (job.status === "error") {
      return { cost: 0, data: { jobId: job.id, status: "error", source: job.source, error: job.error ?? "failed" } };
    }
    if (!job.providerRef) {
      return { cost: 0, data: { jobId: job.id, status: job.status as "done", source: job.source, total: job.records ?? 0 } };
    }
    const prog = (await datasetsRequest(`/progress/${job.providerRef}`)) as { status?: string; records?: number; errors?: number };
    if (prog.status === "failed") {
      await db.webJob.update({ where: { id: job.id }, data: { status: "error", error: "provider failed" } });
      return { cost: 0, data: { jobId: job.id, status: "error", source: job.source, error: "provider failed" } };
    }
    if (prog.status !== "ready") {
      return { cost: 0, data: { jobId: job.id, status: "running", source: job.source } };
    }
    const records = (await datasetsRequest(`/snapshot/${job.providerRef}?format=json`)) as unknown[];
    const list = Array.isArray(records) ? records : [];
    // Reclamar el cobro UNA vez (updateMany con charged:false = lock optimista).
    const claimed = await db.webJob.updateMany({
      where: { id: job.id, charged: false },
      data: { charged: true, status: "done", records: list.length },
    });
    return {
      cost: claimed.count > 0 ? list.length : 0,
      data: { jobId: job.id, status: "done", source: job.source, records: list, total: list.length },
    };
  },
};

/* ────────────────────────────────────────────────────────────────────── */
/* CRAWL — sitio completo (BFS mismo host) sobre el Unlocker              */
/* ────────────────────────────────────────────────────────────────────── */

export interface BrightdataCrawlInput {
  url: string;
  /** Máximo de páginas a leer (1-20). Default 10. */
  maxPages?: number;
  country?: string;
}

export interface BrightdataCrawlOutput extends ServiceResult {
  data: {
    startUrl: string;
    pages: { url: string; markdown: string }[];
    /** Links del mismo host encontrados pero no visitados (para continuar). */
    pending: string[];
  };
}

const CRAWL_MAX_PAGES = 20;
const CRAWL_MAX_TOTAL_BYTES = 2_000_000;
const CRAWL_PAGE_MAX_LEN = 150_000;

function sameHostLinks(markdown: string, base: URL): string[] {
  const out = new Set<string>();
  const re = /\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) {
    try {
      const u = new URL(m[1], base);
      if (u.host !== base.host) continue;
      if (/\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|mp3|css|js)$/i.test(u.pathname)) continue;
      u.hash = "";
      out.add(u.toString());
    } catch {
      /* link roto: ignorar */
    }
  }
  return [...out];
}

export const brightdataCrawlService: ServiceDef<BrightdataCrawlInput, BrightdataCrawlOutput> = {
  id: "research.brightdata.crawl",
  product: "research",
  displayName: "Web Crawl (sitio completo)",
  description: "Lee una página y sigue sus links internos hasta maxPages. Devuelve markdown por página; cobra 1 consulta por página leída.",
  estimateCost(input) {
    return Math.min(CRAWL_MAX_PAGES, Math.max(1, input.maxPages ?? 10));
  },
  async execute(input) {
    const start = input.url?.trim();
    if (!start) throw new ServiceProviderError("research.brightdata.crawl", 400, "url is required");
    const base = new URL(start);
    const maxPages = Math.min(CRAWL_MAX_PAGES, Math.max(1, input.maxPages ?? 10));
    const zone = process.env.BRIGHTDATA_UNLOCKER_ZONE || "mcp_unlocker";

    const queue: string[] = [base.toString()];
    const seen = new Set<string>(queue);
    const pages: { url: string; markdown: string }[] = [];
    let bytes = 0;

    while (queue.length && pages.length < maxPages && bytes < CRAWL_MAX_TOTAL_BYTES) {
      const url = queue.shift()!;
      let md = "";
      try {
        const resp = (await brightdataRequest({
          zone,
          url,
          format: "json",
          country: input.country,
          data_format: "markdown",
          serviceId: "research.brightdata.crawl",
        })) as BrightdataResponse;
        md = (resp.body ?? "").slice(0, CRAWL_PAGE_MAX_LEN);
      } catch {
        continue; // una página caída no tumba el crawl ni se cobra
      }
      pages.push({ url, markdown: md });
      bytes += md.length;
      for (const link of sameHostLinks(md, base)) {
        if (!seen.has(link)) {
          seen.add(link);
          queue.push(link);
        }
      }
    }
    return {
      cost: Math.max(1, pages.length),
      data: { startUrl: base.toString(), pages, pending: queue.slice(0, 100) },
    };
  },
};
