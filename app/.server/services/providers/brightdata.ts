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

// La zona SERP falla contra Google de forma INTERMITENTE: el captcha llega como
// status_code 502 con `x-brd-error-code: expect_body|captcha`. Medido: de 3
// intentos con la misma query, uno pasó. Sin reintento el agente se rinde a la
// primera. Mismo patrón que sqldFetch (app/.server/sqld.ts).
//
// El 429 `failed_query_rejected` NO se reintenta: es el cooldown que Brightdata
// pone sobre esa query tras un fallo — insistir sólo lo alarga. Se propaga para
// que la superficie lo mapee como reintentable (429 + Retry-After).
const CAPTCHA_RETRIES = 3;
const CAPTCHA_BACKOFF_MS = [1200, 2500]; // tras el intento 1 y 2
const RETRYABLE_BRD_CODES = new Set(["expect_body", "captcha"]);
const GATEWAY_STATUSES = new Set([502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BRIGHTDATA_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    // Un 502/503/504 de la API misma es su balanceador (medido en prod 22-oct: «502 Bad
    // Gateway» en una lectura de MELI que al reintentar pasó): se reintenta como el captcha.
    if (GATEWAY_STATUSES.has(res.status) && attempt < CAPTCHA_RETRIES - 1) {
      await sleep(CAPTCHA_BACKOFF_MS[attempt] ?? 2500);
      continue;
    }
    // Fallo de la API misma (llave, zona inexistente, payload malo): no se reintenta.
    // El mensaje nunca nombra al proveedor ni le pasa su HTML al cliente.
    if (!res.ok) {
      console.warn(`[web] proveedor ${res.status}: ${text.slice(0, 300)}`);
      const msg = GATEWAY_STATUSES.has(res.status)
        ? "el servicio web no respondió; reintenta en unos segundos"
        : `el servicio web rechazó la petición (${res.status})`;
      throw new ServiceProviderError(input.serviceId, res.status, msg);
    }
    // format=raw → HTML body directly. format=json → JSON envelope.
    if (input.format === "raw") return text;
    let parsed: BrightdataResponse;
    try {
      parsed = JSON.parse(text) as BrightdataResponse;
    } catch {
      throw new ServiceProviderError(input.serviceId, res.status, "el servicio web devolvió una respuesta ilegible");
    }
    // El envelope viene con HTTP 200 aunque el target haya fallado: un captcha de
    // Google llega como status_code 502 (`expect_body`/`captcha`) y el cooldown
    // posterior como 429 (`failed_query_rejected`), ambos con `body` vacío. Sin
    // esto se devolvía un resultado vacío como éxito — y se cobraba la consulta.
    const upstream = Number(parsed?.status_code ?? 0);
    if (upstream >= 400) {
      const hdrs = (parsed?.headers ?? {}) as Record<string, string>;
      const code = hdrs["x-brd-error-code"] ?? "";
      const reason = hdrs["x-brd-error"] || code || "upstream error";
      const transient = upstream >= 500 && RETRYABLE_BRD_CODES.has(code);
      if (transient && attempt < CAPTCHA_RETRIES - 1) {
        await sleep(CAPTCHA_BACKOFF_MS[attempt] ?? 2500);
        continue;
      }
      throw new ServiceProviderError(input.serviceId, upstream, `el sitio respondió ${upstream} (${reason})`);
    }
    return parsed;
  }
}

/* ────────────────────────────────────────────────────────────────────── */
/* SCRAPE — Web Unlocker                                                  */
/* ────────────────────────────────────────────────────────────────────── */

export interface BrightdataScrapeInput {
  /** Target URL to fetch (full https://...). Not needed with `fetchId`. */
  url?: string;
  /** Read another chunk of a page already fetched (free, no new request). */
  fetchId?: string;
  /** Character offset of the chunk to return. Default 0. */
  offset?: number;
  /** ISO 3166-1 country code (us, mx, gb...). Default unset. */
  country?: string;
  /** If true, returns markdown instead of raw HTML. Default false (raw HTML). */
  asMarkdown?: boolean;
  /** Con asMarkdown: quita nav, footer, iconos y "skip to content". Default false. */
  onlyMainContent?: boolean;
  /** Override Unlocker zone. Default from env BRIGHTDATA_UNLOCKER_ZONE. */
  zone?: string;
}

export interface BrightdataScrapeOutput extends ServiceResult {
  data: {
    url: string;
    statusCode: number;
    /** Up to SCRAPE_BODY_MAX_LEN characters, starting at `offset`. */
    body: string;
    format: "raw" | "markdown";
    offset: number;
    /** Characters of the WHOLE page — compare with body.length. */
    length: number;
    /** true = there is more after this chunk; read it with { fetchId, offset: nextOffset }. */
    truncated: boolean;
    nextOffset?: number;
    /** Present when the page is longer than one chunk (kept 24 h). */
    fetchId?: string;
  };
}

// Tope por respuesta (MCP y REST). Antes se cortaba aquí EN SILENCIO: una búsqueda de
// Amazon llegaba con 200,000 caracteres exactos y un solo precio, y el agente la daba por
// completa. Ahora el corte se declara (`truncated`) y el resto se lee por tramos.
export const SCRAPE_BODY_MAX_LEN = 200_000;
// Los tramos se leen del cuerpo guardado, no de otra petición: gratis e idéntico.
export const WEB_FETCH_TTL_MS = 24 * 60 * 60 * 1000;
const WEB_FETCH_PREFIX = "web/";

function webFetchStore() {
  // Bucket privado de plataforma; nunca el público (son páginas de terceros).
  return import("../../storage").then((m) => m.getPlatformDefaultClient({ prefix: WEB_FETCH_PREFIX }));
}

/** Arma la respuesta de un tramo a partir del cuerpo COMPLETO. */
export function sliceFetchBody(full: string, offset = 0) {
  const start = Math.min(Math.max(0, Math.floor(offset)), full.length);
  const body = full.slice(start, start + SCRAPE_BODY_MAX_LEN);
  const end = start + body.length;
  const truncated = end < full.length;
  return { body, offset: start, length: full.length, truncated, nextOffset: truncated ? end : undefined };
}

export const brightdataScrapeService: ServiceDef<BrightdataScrapeInput, BrightdataScrapeOutput> = {
  id: "research.brightdata.scrape",
  product: "research",
  displayName: "Web Scrape (Brightdata Unlocker)",
  description:
    "Fetches a single web page via Brightdata Web Unlocker. Bypasses bot detection, returns HTML or markdown.",
  estimateCost(input) {
    // Leer otro tramo de una página ya pedida no vuelve a salir a internet: gratis.
    return input.fetchId ? 0 : 1;
  },
  async execute(input, ctx) {
    const { db } = await import("../../db");

    // ── Siguiente tramo de una página ya pedida ──
    if (input.fetchId) {
      const job = /^[0-9a-f]{24}$/.test(input.fetchId)
        ? await db.webJob.findFirst({ where: { id: input.fetchId, userId: ctx.userId, kind: "fetch" } })
        : null;
      if (!job?.providerRef || Date.now() - job.createdAt.getTime() > WEB_FETCH_TTL_MS) {
        throw new ServiceProviderError(
          "research.brightdata.scrape",
          404,
          "fetchId no encontrado o vencido (se guarda 24 h). Vuelve a pedir la página con `url`.",
        );
      }
      const store = await webFetchStore();
      const res = await fetch(await store.getReadUrl(job.providerRef, 300));
      if (!res.ok) {
        throw new ServiceProviderError("research.brightdata.scrape", 404, "fetchId vencido. Vuelve a pedir la página con `url`.");
      }
      const meta = (job.meta ?? {}) as { url?: string; statusCode?: number; format?: "raw" | "markdown" };
      const part = sliceFetchBody(await res.text(), input.offset);
      return {
        cost: 0,
        data: { url: meta.url ?? "", statusCode: meta.statusCode ?? 200, format: meta.format ?? "raw", fetchId: job.id, ...part },
      };
    }

    const url = input.url?.trim();
    if (!url) {
      throw new ServiceProviderError("research.brightdata.scrape", 400, "url is required");
    }
    const zone = input.zone || process.env.BRIGHTDATA_UNLOCKER_ZONE || "mcp_unlocker";
    let full: string;
    let statusCode = 200;
    const format: "raw" | "markdown" = input.asMarkdown ? "markdown" : "raw";

    if (input.asMarkdown) {
      const resp = (await brightdataRequest({
        zone,
        url,
        format: "json",
        country: input.country,
        data_format: "markdown",
        serviceId: "research.brightdata.scrape",
      })) as BrightdataResponse;
      full = resp.body ?? "";
      statusCode = resp.status_code ?? 200;
      if (input.onlyMainContent) {
        const { extractMainContent } = await import("./parsers/mainContent");
        full = extractMainContent(full);
      }
    } else {
      full = (await brightdataRequest({
        zone,
        url,
        format: "raw",
        country: input.country,
        serviceId: "research.brightdata.scrape",
      })) as string;
    }

    const part = sliceFetchBody(full, input.offset);
    if (part.length <= SCRAPE_BODY_MAX_LEN) {
      return { cost: 1, data: { url, statusCode, format, ...part } };
    }
    // Página grande: se guarda completa para leer los demás tramos sin volver a pedirla.
    // Si guardar falla, se responde igual (con `truncated` honesto) en vez de perder la consulta.
    let fetchId: string | undefined;
    try {
      const key = `fetch/${ctx.userId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.txt`;
      const store = await webFetchStore();
      await store.putObject(key, Buffer.from(full, "utf8"), "text/plain; charset=utf-8");
      const job = await db.webJob.create({
        data: {
          userId: ctx.userId,
          kind: "fetch",
          source: new URL(url).host,
          providerRef: key,
          status: "done",
          charged: true,
          bodyLength: full.length,
          meta: { url, statusCode, format },
        },
      });
      fetchId = job.id;
    } catch (e) {
      console.warn("[web_fetch] no se pudo guardar la página completa:", e instanceof Error ? e.message : e);
    }
    return { cost: 1, data: { url, statusCode, format, fetchId, ...part } };
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
    console.warn(`[web] datasets ${res.status}: ${text.slice(0, 300)}`);
    throw new ServiceProviderError("research.brightdata.extract", res.status, `el servicio de extracción rechazó la petición (${res.status})`);
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

/** Estado de un snapshot en el proveedor. Lo usan extractStatus y el barrido de avisos. */
export async function extractProgress(
  snapshotId: string,
): Promise<{ state: "running" | "ready" | "failed"; records?: number }> {
  const prog = (await datasetsRequest(`/progress/${snapshotId}`)) as { status?: string; records?: number };
  const state = prog.status === "failed" ? "failed" : prog.status === "ready" ? "ready" : "running";
  return { state, records: typeof prog.records === "number" ? prog.records : undefined };
}

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
    // `ready` lo marca el barrido (webJobSweep) al ver el job listo: no hace falta volver a preguntar.
    if (job.status !== "ready" && job.status !== "done") {
      const { state } = await extractProgress(job.providerRef);
      if (state === "failed") {
        await db.webJob.update({ where: { id: job.id }, data: { status: "error", error: "provider failed" } });
        return { cost: 0, data: { jobId: job.id, status: "error", source: job.source, error: "provider failed" } };
      }
      if (state !== "ready") {
        return { cost: 0, data: { jobId: job.id, status: "running", source: job.source } };
      }
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
  /** Quita nav, footer e iconos de cada página. Default false. */
  onlyMainContent?: boolean;
}

export interface BrightdataCrawlOutput extends ServiceResult {
  data: {
    startUrl: string;
    /** `truncated` = la página pasaba de CRAWL_PAGE_MAX_LEN y se cortó (léela entera con web_fetch). */
    pages: { url: string; markdown: string; truncated: boolean }[];
    /** Links del mismo host encontrados pero no visitados (para continuar). */
    pending: string[];
    /** Por qué paró: llegó a maxPages, al tope de bytes, o ya no había links. */
    stoppedBy: "maxPages" | "bytes" | "done";
    /** Páginas que fallaron al leerse (no se cobran). */
    failed: string[];
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
    const pages: { url: string; markdown: string; truncated: boolean }[] = [];
    const failed: string[] = [];
    let bytes = 0;
    const { extractMainContent } = await import("./parsers/mainContent");

    while (queue.length && pages.length < maxPages && bytes < CRAWL_MAX_TOTAL_BYTES) {
      const url = queue.shift()!;
      let md = "";
      let truncated = false;
      try {
        const resp = (await brightdataRequest({
          zone,
          url,
          format: "json",
          country: input.country,
          data_format: "markdown",
          serviceId: "research.brightdata.crawl",
        })) as BrightdataResponse;
        md = resp.body ?? "";
        truncated = md.length > CRAWL_PAGE_MAX_LEN;
        md = md.slice(0, CRAWL_PAGE_MAX_LEN);
      } catch {
        failed.push(url);
        continue; // una página caída no tumba el crawl ni se cobra
      }
      // Los links se sacan del markdown COMPLETO (el nav es donde están);
      // lo que se guarda es la versión limpia si la pidieron.
      const kept = input.onlyMainContent ? extractMainContent(md) : md;
      pages.push({ url, markdown: kept, truncated });
      bytes += kept.length;
      for (const link of sameHostLinks(md, base)) {
        if (!seen.has(link)) {
          seen.add(link);
          queue.push(link);
        }
      }
    }
    return {
      cost: Math.max(1, pages.length),
      data: {
        startUrl: base.toString(),
        pages,
        pending: queue.slice(0, 100),
        stoppedBy: !queue.length ? "done" : pages.length >= maxPages ? "maxPages" : "bytes",
        failed,
      },
    };
  },
};

/* ────────────────────────────────────────────────────────────────────── */
/* CANARIO — la plataforma prueba lo que vende, sin cobrarle a nadie       */
/* ────────────────────────────────────────────────────────────────────── */

export type ProbeResult = { ok: boolean; ms: number; detail: string };

// Un MELI sano trae 48 por página; menos de 10 = cambió el HTML y el parser ya no lo entiende.
export const CANARY_MELI_MIN_RECORDS = 10;

async function timed(fn: () => Promise<string>): Promise<ProbeResult> {
  const t = Date.now();
  try {
    const detail = await fn();
    return { ok: true, ms: Date.now() - t, detail };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, detail: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }
}

/**
 * Las tres cosas que un cliente usa de verdad, contra sitios que bloquean bots:
 * buscar (SERP), leer (Amazon MX por el Unlocker) y extraer (parser propio de MELI).
 * Llama al proveedor directo: no pasa por consumeService ni crea WebJobs.
 */
export async function probeWebProvider(): Promise<{ search: ProbeResult; fetch: ProbeResult; meli: ProbeResult }> {
  const unlocker = process.env.BRIGHTDATA_UNLOCKER_ZONE || "mcp_unlocker";
  const [search, fetchR, meli] = await Promise.all([
    timed(async () => {
      const r = await brightdataSearchService.execute({ query: "tienda en linea", country: "mx" }, { userId: "" });
      const organic = (r.data.results as { organic?: unknown[] } | undefined)?.organic;
      if (!Array.isArray(organic) || organic.length === 0) throw new Error("sin resultados orgánicos");
      return `${organic.length} orgánicos`;
    }),
    timed(async () => {
      const html = (await brightdataRequest({
        zone: unlocker,
        url: "https://www.amazon.com.mx/s?k=audifonos",
        format: "raw",
        country: "mx",
        serviceId: "research.brightdata.scrape",
      })) as string;
      if (html.length < 20_000 || /captcha/i.test(html.slice(0, 5_000))) throw new Error(`página bloqueada o vacía (${html.length} caracteres)`);
      return `${html.length} caracteres`;
    }),
    timed(async () => {
      const { parseMercadoLibreListing, mercadoLibreListingUrl } = await import("./parsers/mercadolibre");
      const html = (await brightdataRequest({
        zone: unlocker,
        // Búsqueda estable (la misma del fixture): el canario debe saltar por una rotura, no
        // porque cambió el surtido de una búsqueda.
        url: mercadoLibreListingUrl("iphone 15"),
        format: "raw",
        country: "mx",
        serviceId: "research.brightdata.extract",
      })) as string;
      const n = parseMercadoLibreListing(html).length;
      if (n < CANARY_MELI_MIN_RECORDS) throw new Error(`el parser sacó ${n} productos (mínimo ${CANARY_MELI_MIN_RECORDS}): ¿cambió el HTML?`);
      return `${n} productos`;
    }),
  ]);
  return { search, fetch: fetchR, meli };
}

/* ────────────────────────────────────────────────────────────────────── */
/* MAP — todas las URLs de un sitio, sin leerlas                          */
/* ────────────────────────────────────────────────────────────────────── */

export interface BrightdataMapInput {
  url: string;
  /** Sólo URLs que contengan este texto (p. ej. "/blog/"). */
  search?: string;
  /** Máximo de URLs a devolver (1-5000). Default 1000. */
  limit?: number;
}

export interface BrightdataMapOutput extends ServiceResult {
  data: {
    url: string;
    urls: string[];
    total: number;
    /** De dónde salieron: el sitemap del sitio o, si no tiene, los links de la portada. */
    source: "sitemap" | "links";
    /** true = había más que `limit`. */
    truncated: boolean;
  };
}

const MAP_MAX_LIMIT = 5000;
const MAP_MAX_DOCS = 10; // robots + sitemaps leídos; cada uno es una petición (y una consulta)

/** `<loc>` de un sitemap o de un índice de sitemaps. */
export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) =>
    m[1].replace(/&amp;/g, "&"),
  );
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  return isIndex ? { urls: [], sitemaps: locs } : { urls: locs, sitemaps: [] };
}

export const brightdataMapService: ServiceDef<BrightdataMapInput, BrightdataMapOutput> = {
  id: "research.brightdata.map",
  product: "research",
  displayName: "Web Map (URLs de un sitio)",
  description: "Lista las URLs de un sitio desde su sitemap (o los links de su portada) sin leerlas. Cobra 1 consulta por documento leído (máx. 10).",
  estimateCost() {
    return 1;
  },
  async execute(input) {
    const start = input.url?.trim();
    if (!start) throw new ServiceProviderError("research.brightdata.map", 400, "url is required");
    const base = new URL(start);
    const limit = Math.min(MAP_MAX_LIMIT, Math.max(1, input.limit ?? 1000));
    const zone = process.env.BRIGHTDATA_UNLOCKER_ZONE || "mcp_unlocker";
    let docs = 0;
    const get = async (url: string) => {
      docs++;
      try {
        return (await brightdataRequest({ zone, url, format: "raw", serviceId: "research.brightdata.map" })) as string;
      } catch {
        return ""; // un sitemap caído no tumba el mapa
      }
    };

    // 1. robots.txt declara los sitemaps; si no declara ninguno, se prueba /sitemap.xml.
    const robots = await get(new URL("/robots.txt", base).toString());
    const queue = [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
    if (!queue.length) queue.push(new URL("/sitemap.xml", base).toString());

    const found = new Set<string>();
    const seenMaps = new Set<string>();
    // Deja 1 documento libre para caer a los links de la portada si los sitemaps no dan nada.
    while (queue.length && docs < MAP_MAX_DOCS - 1 && found.size < limit * 2) {
      const sm = queue.shift()!;
      if (seenMaps.has(sm) || /\.gz($|\?)/i.test(sm)) continue; // .gz llega binario por el desbloqueador
      seenMaps.add(sm);
      const { urls, sitemaps } = parseSitemap(await get(sm));
      // Los hijos de un índice van PRIMERO: Liverpool declara su índice y luego 13 sitemaps de
      // imágenes que dan 404; en orden de llegada se gastaba el cupo en ésos y daba 0 URLs.
      queue.unshift(...sitemaps);
      for (const u of urls) {
        try {
          if (new URL(u).host.replace(/^www\./, "") === base.host.replace(/^www\./, "")) found.add(u);
        } catch {
          /* loc roto */
        }
      }
    }

    // 2. Sin sitemap: los links internos de la portada.
    let source: "sitemap" | "links" = "sitemap";
    if (!found.size && docs < MAP_MAX_DOCS) {
      source = "links";
      docs++;
      const resp = (await brightdataRequest({
        zone,
        url: base.toString(),
        format: "json",
        data_format: "markdown",
        serviceId: "research.brightdata.map",
      })) as BrightdataResponse;
      for (const link of sameHostLinks(resp.body ?? "", base)) found.add(link);
    }

    const needle = input.search?.trim().toLowerCase();
    const all = [...found].filter((u) => !needle || u.toLowerCase().includes(needle));
    return {
      cost: Math.max(1, docs),
      data: { url: base.toString(), urls: all.slice(0, limit), total: all.length, source, truncated: all.length > limit },
    };
  },
};
