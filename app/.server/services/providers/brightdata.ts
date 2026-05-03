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
 *   BRIGHTDATA_UNLOCKER_ZONE  (default: "web_unlocker1")
 *   BRIGHTDATA_SERP_ZONE      (default: "serp_api1")
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
    const zone = input.zone || process.env.BRIGHTDATA_UNLOCKER_ZONE || "web_unlocker1";
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

function buildSearchUrl(query: string, engine: string): string {
  const q = encodeURIComponent(query);
  switch (engine) {
    case "bing":
      return `https://www.bing.com/search?q=${q}`;
    case "yandex":
      return `https://yandex.com/search/?text=${q}`;
    case "duckduckgo":
      return `https://duckduckgo.com/?q=${q}`;
    case "google":
    default:
      return `https://www.google.com/search?q=${q}`;
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
    const zone = input.zone || process.env.BRIGHTDATA_SERP_ZONE || "serp_api1";
    const url = buildSearchUrl(query, engine);

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
