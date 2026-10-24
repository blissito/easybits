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
  /** Cualquier página: con `schema`, un modelo llena ese JSON Schema desde la página (síncrono). */
  url?: string;
  /** JSON Schema de lo que quieres sacar de `url`. */
  schema?: Record<string, unknown>;
  /** Instrucción opcional para el modelo: «sólo los planes mensuales», «precios en MXN». */
  prompt?: string;
  /** Fuente curada (ver EXTRACT_SOURCES) o "mercadolibre". */
  source?: string;
  /** Dataset del proveedor directo (cualquiera del catálogo), si no hay `source`. */
  datasetId?: string;
  /** Inputs según la fuente: [{url}] o [{keyword,country}] o {query} para mercadolibre. No va con `url`+`schema`. */
  input?: Record<string, unknown> | Record<string, unknown>[];
  country?: string;
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
    /** `url`+`schema`: el objeto que llenó el modelo, ya validado contra el esquema. */
    data?: unknown;
    /** `url`+`schema`: la página pasaba del tope que lee el modelo y se cortó. */
    truncated?: boolean;
  };
}

// Lo que lee el modelo de una página. ~60K caracteres ≈ 15K tokens: cabe una ficha o un
// listado largo y mantiene el costo por llamada acotado.
const SCHEMA_EXTRACT_MAX_CHARS = 60_000;
// 1 consulta por leer la página + 1 por cada ~4,000 tokens del modelo (entrada + salida).
// Con Haiku eso cubre su costo real incluso en el pack grande ($0.10 MXN por consulta).
export const SCHEMA_TOKENS_PER_QUERY = 4000;
/**
 * El modelo exige `additionalProperties: false` en CADA objeto del esquema (falló en prod el
 * 22-oct con un esquema normal: «For 'object' type, 'additionalProperties' must be explicitly
 * set to false»). Nadie lo escribe a mano, así que se completa aquí, recorriendo todo el árbol.
 * Lo que el usuario sí haya puesto se respeta.
 */
export function strictJsonSchema<T>(node: T): T {
  if (Array.isArray(node)) return node.map((n) => strictJsonSchema(n)) as T;
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    // `properties`/`$defs`/`definitions` son mapas de nombre→esquema: se recorre cada valor.
    if ((k === "properties" || k === "$defs" || k === "definitions") && v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([n, s]) => [n, strictJsonSchema(s)]));
    } else {
      out[k] = strictJsonSchema(v);
    }
  }
  const t = out.type;
  const isObject = t === "object" || (Array.isArray(t) && t.includes("object")) || (t === undefined && "properties" in out);
  if (isObject && out.additionalProperties === undefined) out.additionalProperties = false;
  return out as T;
}

export function schemaExtractCost(totalTokens: number) {
  return 1 + Math.max(1, Math.ceil(totalTokens / SCHEMA_TOKENS_PER_QUERY));
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
    if (input.url && input.schema) return schemaExtractCost(SCHEMA_EXTRACT_MAX_CHARS / 4); // peor caso
    // Pre-check con el tope pedido; el cobro real ocurre en extractStatus con
    // los registros devueltos (o aquí mismo para parsers síncronos).
    const inputs = Array.isArray(input.input) ? input.input.length : 1;
    return Math.min(EXTRACT_MAX_LIMIT, input.limit ?? EXTRACT_DEFAULT_LIMIT) * Math.max(1, inputs);
  },
  async execute(input, ctx) {
    const { db } = await import("../../db");
    const source = input.source?.trim();
    const limit = Math.min(EXTRACT_MAX_LIMIT, Math.max(1, input.limit ?? EXTRACT_DEFAULT_LIMIT));
    // ── Cualquier URL con un esquema: página → markdown limpio → el modelo llena el JSON Schema ──
    if (input.url || input.schema) {
      if (!input.url || !input.schema || typeof input.schema !== "object") {
        throw new ServiceProviderError("research.brightdata.extract", 400, "pasa `url` y `schema` (un JSON Schema) juntos");
      }
      const zone = process.env.BRIGHTDATA_UNLOCKER_ZONE || "mcp_unlocker";
      const resp = (await brightdataRequest({
        zone,
        url: input.url,
        format: "json",
        country: input.country,
        data_format: "markdown",
        serviceId: "research.brightdata.extract",
      })) as BrightdataResponse;
      const { extractMainContent } = await import("./parsers/mainContent");
      const full = extractMainContent(resp.body ?? "");
      const page = full.slice(0, SCHEMA_EXTRACT_MAX_CHARS);
      const { generateObject, jsonSchema } = await import("ai");
      const { getAiModel, resolveModelLocal } = await import("../../aiModels");
      const model = resolveModelLocal(await getAiModel("webExtractSchema"));
      let result;
      try {
        result = await generateObject({
          model,
          schema: jsonSchema(strictJsonSchema(input.schema) as Parameters<typeof jsonSchema>[0]),
          system:
            "Extraes datos de una página web a un JSON Schema. Usa SÓLO lo que dice la página: si un dato no está, déjalo vacío o null; nunca lo inventes ni lo completes con lo que sabes.",
          prompt: `${input.prompt ? `Instrucción: ${input.prompt}

` : ""}Página (${input.url}):

${page}`,
        });
      } catch (e) {
        throw new ServiceProviderError(
          "research.brightdata.extract",
          422,
          `el modelo no pudo llenar el esquema: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`,
        );
      }
      const tokens = (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);
      return {
        cost: schemaExtractCost(tokens),
        data: { jobId: "", status: "done", source: new URL(input.url).host, data: result.object, truncated: full.length > page.length },
      };
    }

    if (!input.input) throw new ServiceProviderError("research.brightdata.extract", 400, "input is required");
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
  /** Máximo de páginas a leer. 1-20 responde al momento; 21-2000 corre en segundo plano (job). Default 10. */
  maxPages?: number;
  country?: string;
  /** Quita nav, footer e iconos de cada página. Default false. */
  onlyMainContent?: boolean;
}

export interface BrightdataCrawlOutput extends ServiceResult {
  data: BrightdataCrawlSync | BrightdataCrawlJobStarted;
}

/** Rastreo grande: arrancó en segundo plano. */
export interface BrightdataCrawlJobStarted {
  jobId: string;
  status: "running";
  startUrl: string;
  maxPages: number;
  /** URLs ya en la cola al arrancar (la de inicio + las del sitemap). */
  queued: number;
}

export interface BrightdataCrawlSync {
  startUrl: string;
  /** `truncated` = la página pasaba de CRAWL_PAGE_MAX_LEN y se cortó (léela entera con web_fetch). */
  pages: { url: string; markdown: string; truncated: boolean }[];
  /** Links del mismo host encontrados pero no visitados (para continuar). */
  pending: string[];
  /** Por qué paró: llegó a maxPages, al tope de bytes, o ya no había links. */
  stoppedBy: "maxPages" | "bytes" | "done";
  /** Páginas que fallaron al leerse (no se cobran). */
  failed: string[];
}

const CRAWL_MAX_PAGES = 20;
const CRAWL_MAX_TOTAL_BYTES = 2_000_000;
const CRAWL_PAGE_MAX_LEN = 150_000;

/**
 * Una sola forma por página: sin `#`, la raíz con «/» y las demás rutas sin «/» final.
 * Sin esto el sitemap («https://ej.com») y los links («https://ej.com/») contaban como dos
 * páginas: se leían y se cobraban dos veces (medido en prod con fixtergeek.com, 22-oct).
 */
export function canonicalUrl(raw: string, base?: URL): string | null {
  try {
    const u = base ? new URL(raw, base) : new URL(raw);
    u.hash = "";
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return null;
  }
}

function sameHostLinks(markdown: string, base: URL): string[] {
  const out = new Set<string>();
  const re = /\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) {
    const c = canonicalUrl(m[1], base);
    if (!c) continue; // link roto
    const u = new URL(c);
    if (u.host !== base.host) continue;
    if (/\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|mp3|css|js)$/i.test(u.pathname)) continue;
    out.add(c);
  }
  return [...out];
}

export type CrawledPage = { url: string; markdown: string; truncated: boolean };

/**
 * Lee UNA página del rastreo como markdown. Devuelve la página (con su versión limpia si se
 * pidió) y sus links del mismo host, sacados del markdown COMPLETO (el nav es donde están).
 * `null` = no se pudo leer (no se cobra). La usan el rastreo corto y el de segundo plano.
 */
export async function crawlOnePage(
  url: string,
  base: URL,
  opts: { country?: string; onlyMainContent?: boolean },
): Promise<{ page: CrawledPage; links: string[] } | null> {
  const zone = process.env.BRIGHTDATA_UNLOCKER_ZONE || "mcp_unlocker";
  let md: string;
  try {
    const resp = (await brightdataRequest({
      zone,
      url,
      format: "json",
      country: opts.country,
      data_format: "markdown",
      serviceId: "research.brightdata.crawl",
    })) as BrightdataResponse;
    md = resp.body ?? "";
  } catch {
    return null;
  }
  const truncated = md.length > CRAWL_PAGE_MAX_LEN;
  md = md.slice(0, CRAWL_PAGE_MAX_LEN);
  const { extractMainContent } = await import("./parsers/mainContent");
  const kept = opts.onlyMainContent ? extractMainContent(md) : md;
  return { page: { url, markdown: kept, truncated }, links: sameHostLinks(md, base) };
}

export const brightdataCrawlService: ServiceDef<BrightdataCrawlInput, BrightdataCrawlOutput> = {
  id: "research.brightdata.crawl",
  product: "research",
  displayName: "Web Crawl (sitio completo)",
  description: "Lee una página y sigue sus links internos hasta maxPages. Devuelve markdown por página; cobra 1 consulta por página leída.",
  estimateCost(input) {
    // Un rastreo grande se cobra por página conforme avanza; para arrancar basta un lote.
    return Math.min(CRAWL_MAX_PAGES, Math.max(1, input.maxPages ?? 10));
  },
  async execute(input, ctx) {
    const start = input.url?.trim();
    if (!start) throw new ServiceProviderError("research.brightdata.crawl", 400, "url is required");
    const base = new URL(start);

    // ── Rastreo grande: job en segundo plano, cola sembrada con el sitemap ──
    if ((input.maxPages ?? 10) > CRAWL_MAX_PAGES) {
      const { createCrawlJob, CRAWL_JOB_MAX_PAGES } = await import("../../core/webCrawlJobs");
      const maxPages = Math.min(CRAWL_JOB_MAX_PAGES, Math.floor(input.maxPages!));
      const map = await brightdataMapService.execute({ url: base.toString(), limit: maxPages * 2 }, ctx).catch(() => null);
      const job = await createCrawlJob(ctx.userId, {
        startUrl: base.toString(),
        maxPages,
        country: input.country,
        onlyMainContent: input.onlyMainContent,
        seed: map?.data.urls ?? [],
      });
      const meta = job.meta as { queue: string[] };
      return {
        cost: map?.cost ?? 0, // los documentos del sitemap; las páginas se cobran al leerse
        data: { jobId: job.id, status: "running", startUrl: base.toString(), maxPages, queued: meta.queue.length },
      };
    }

    const maxPages = Math.min(CRAWL_MAX_PAGES, Math.max(1, input.maxPages ?? 10));
    const queue: string[] = [base.toString()];
    const seen = new Set<string>(queue);
    const pages: CrawledPage[] = [];
    const failed: string[] = [];
    let bytes = 0;

    while (queue.length && pages.length < maxPages && bytes < CRAWL_MAX_TOTAL_BYTES) {
      const url = queue.shift()!;
      const got = await crawlOnePage(url, base, input);
      if (!got) {
        failed.push(url);
        continue; // una página caída no tumba el crawl ni se cobra
      }
      pages.push(got.page);
      bytes += got.page.markdown.length;
      for (const link of got.links) {
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

/* ────────────────────────────────────────────────────────────────────── */
/* INTERACT — navegador remoto: clics, escribir, scroll antes de leer     */
/* ────────────────────────────────────────────────────────────────────── */

export type InteractAction =
  | { type: "click"; selector: string }
  | { type: "type"; selector: string; text: string }
  | { type: "press"; key: string }
  | { type: "scroll"; y?: number | "bottom" }
  | { type: "wait"; ms?: number; selector?: string }
  | { type: "select"; selector: string; value: string }
  | { type: "goto"; url: string };

export interface BrightdataInteractInput {
  url: string;
  actions?: InteractAction[];
  /** true = también una captura PNG de cómo quedó la página (URL privada, 24 h). */
  screenshot?: boolean;
  country?: string;
}

export interface BrightdataInteractOutput extends ServiceResult {
  data: {
    url: string;
    title: string;
    /** Texto visible de la página al terminar (hasta 100,000 caracteres). */
    text: string;
    length: number;
    truncated: boolean;
    /** Acciones que sí corrieron. */
    done: number;
    /** Si una acción falló: cuál (índice) y por qué. La página se devuelve como quedó. */
    failedAt?: number;
    error?: string;
    screenshotUrl?: string;
  };
}

// El navegador remoto cuesta varias veces más que leer una página (cobra por tráfico de una
// sesión completa con JS, imágenes y fuentes): tarifa plana por sesión.
export const INTERACT_COST = 5;
export const INTERACT_MAX_ACTIONS = 25;
const INTERACT_TEXT_MAX = 100_000;
const INTERACT_BUDGET_MS = 90_000;
const BROWSER_ZONE = process.env.BRIGHTDATA_BROWSER_ZONE || "mcp_browser";

// Usuario y contraseña de la zona del navegador: se piden a la API de la cuenta con la misma
// llave (sin secreto nuevo) y se guardan 10 min.
let browserAuth: { ws: string; at: number } | null = null;
async function browserEndpoint(): Promise<string> {
  if (browserAuth && Date.now() - browserAuth.at < 10 * 60_000) return browserAuth.ws;
  const h = { Authorization: `Bearer ${getApiKey()}` };
  const status = (await (await fetch("https://api.brightdata.com/status", { headers: h })).json()) as { customer?: string };
  const pw = (await (await fetch(`https://api.brightdata.com/zone/passwords?zone=${BROWSER_ZONE}`, { headers: h })).json()) as {
    passwords?: string[];
  };
  if (!status.customer || !pw.passwords?.[0]) {
    throw new ServiceConfigError("research.brightdata.interact", "BRIGHTDATA browser zone");
  }
  const ws = `wss://brd-customer-${status.customer}-zone-${BROWSER_ZONE}:${pw.passwords[0]}@brd.superproxy.io:9222`;
  browserAuth = { ws, at: Date.now() };
  return ws;
}

/**
 * Sesión del navegador antibot para el navegador del agente (render-svc la abre por CDP cuando
 * la página local regresó captcha). Sólo entrega el endpoint; pasar por consumeService cobra
 * la sesión a las consultas web del dueño, con la misma tarifa plana que web_interact.
 */
export const brightdataBrowserSessionService: ServiceDef<Record<string, never>, ServiceResult & { data: { ws: string } }> = {
  id: "research.brightdata.browser",
  product: "research",
  displayName: "Navegador antibot (sesión)",
  description: "Una sesión del navegador del agente por el navegador remoto de Bright Data, para páginas que piden captcha. Tarifa plana por sesión.",
  estimateCost() {
    return INTERACT_COST;
  },
  async execute() {
    // Salida desde México: sin esto Bright Data elegía cualquier país y Google respondía en
    // portugués («Pesquisa Google») con resultados de Brasil.
    const ws = (await browserEndpoint()).replace(/(-zone-[^:]+):/, "$1-country-mx:");
    return { cost: INTERACT_COST, data: { ws } };
  },
};

/** Valida y acota las acciones (lo que llega del agente no se ejecuta a ciegas). */
export function validateActions(actions: unknown): InteractAction[] {
  if (actions === undefined) return [];
  if (!Array.isArray(actions)) throw new ServiceProviderError("research.brightdata.interact", 400, "`actions` debe ser una lista");
  if (actions.length > INTERACT_MAX_ACTIONS) {
    throw new ServiceProviderError("research.brightdata.interact", 400, `máximo ${INTERACT_MAX_ACTIONS} acciones por sesión`);
  }
  return actions.map((a, i) => {
    const t = (a as { type?: string })?.type;
    const need = (k: string) => {
      if (typeof (a as Record<string, unknown>)[k] !== "string" || !(a as Record<string, string>)[k]) {
        throw new ServiceProviderError("research.brightdata.interact", 400, `acción ${i} (${t}): falta \`${k}\``);
      }
    };
    switch (t) {
      case "click": need("selector"); break;
      case "type": need("selector"); need("text"); break;
      case "press": need("key"); break;
      case "select": need("selector"); need("value"); break;
      case "goto": need("url"); break;
      case "scroll": case "wait": break;
      default:
        throw new ServiceProviderError("research.brightdata.interact", 400, `acción ${i}: tipo desconocido «${t}» (click, type, press, scroll, wait, select, goto)`);
    }
    return a as InteractAction;
  });
}

export const brightdataInteractService: ServiceDef<BrightdataInteractInput, BrightdataInteractOutput> = {
  id: "research.brightdata.interact",
  product: "research",
  displayName: "Web Interact (navegador remoto)",
  description: "Abre la página en un navegador remoto, ejecuta clics/escritura/scroll y devuelve cómo quedó. Tarifa plana por sesión.",
  estimateCost() {
    return INTERACT_COST;
  },
  async execute(input, ctx) {
    if (!input.url) throw new ServiceProviderError("research.brightdata.interact", 400, "url is required");
    const actions = validateActions(input.actions);
    const { chromium } = await import("playwright-core");
    const ws = await browserEndpoint();
    const deadline = Date.now() + INTERACT_BUDGET_MS;
    const left = () => Math.max(1_000, deadline - Date.now());

    const browser = await chromium.connectOverCDP(ws, { timeout: 30_000 }).catch((e) => {
      throw new ServiceProviderError("research.brightdata.interact", 502, `el navegador remoto no respondió: ${String(e?.message ?? e).slice(0, 120)}`);
    });
    try {
      const page = await browser.newPage();
      await page.goto(input.url, { timeout: Math.min(45_000, left()), waitUntil: "domcontentloaded" });
      let done = 0;
      let failedAt: number | undefined;
      let error: string | undefined;
      for (const [i, a] of actions.entries()) {
        try {
          const timeout = Math.min(15_000, left());
          if (a.type === "click") await page.click(a.selector, { timeout });
          else if (a.type === "type") await page.fill(a.selector, a.text, { timeout });
          else if (a.type === "press") await page.keyboard.press(a.key);
          else if (a.type === "select") await page.selectOption(a.selector, a.value, { timeout });
          else if (a.type === "goto") await page.goto(a.url, { timeout, waitUntil: "domcontentloaded" });
          else if (a.type === "scroll") {
            await page.evaluate((y) => window.scrollTo(0, y === "bottom" ? document.body.scrollHeight : Number(y ?? window.innerHeight)), a.y ?? null);
            await page.waitForTimeout(500);
          } else if (a.type === "wait") {
            if (a.selector) await page.waitForSelector(a.selector, { timeout });
            else await page.waitForTimeout(Math.min(10_000, Math.max(0, a.ms ?? 1_000)));
          }
          // Un clic o un Enter pueden navegar: esperar a que la página nueva tenga contenido.
          if (a.type === "click" || a.type === "press") await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
          done++;
        } catch (e) {
          failedAt = i;
          error = String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200);
          break;
        }
      }
      const full = (await page.evaluate(() => document.body?.innerText ?? "").catch(() => "")).trim();
      let screenshotUrl: string | undefined;
      if (input.screenshot) {
        const png = await page.screenshot({ fullPage: false }).catch(() => null);
        if (png) {
          const { getPlatformDefaultClient } = await import("../../storage");
          const store = getPlatformDefaultClient({ prefix: "web/" });
          const key = `interact/${ctx.userId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.png`;
          await store.putObject(key, png, "image/png");
          screenshotUrl = await store.getReadUrl(key, 24 * 3600);
        }
      }
      return {
        cost: INTERACT_COST,
        data: {
          url: page.url(),
          title: (await page.title().catch(() => "")).slice(0, 300),
          text: full.slice(0, INTERACT_TEXT_MAX),
          length: full.length,
          truncated: full.length > INTERACT_TEXT_MAX,
          done,
          ...(failedAt !== undefined ? { failedAt, error } : {}),
          ...(screenshotUrl ? { screenshotUrl } : {}),
        },
      };
    } finally {
      await browser.close().catch(() => undefined);
    }
  },
};
