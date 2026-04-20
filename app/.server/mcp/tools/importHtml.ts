/**
 * import_html MCP tool handler.
 *
 * Takes any HTML source (Claude Design, Gamma, Tome, scraped page, etc.) — either
 * as raw HTML or a public URL — and:
 *   1. Fetches the HTML server-side if a URL was passed (SSRF-guarded).
 *   2. Saves a raw copy to the user's file library (always).
 *   3. Normalizes arbitrary hex colors to semantic Tailwind tokens (optional).
 *   4. Runs the existing `sanitizeSemanticColors` pass for Tailwind classes.
 *   5. Creates a Document (Landing v4) with the normalized HTML as one section.
 *   6. Returns fileId + documentId + editorUrl + effective format.
 */

import { nanoid } from "nanoid";
import net from "node:net";
import { promises as dns } from "node:dns";
import { JSDOM } from "jsdom";
import { sanitizeSemanticColors } from "../../sanitizeColors";
import type { AuthContext } from "../../apiAuth";
import { db } from "../../db";
import { getPlatformDefaultClient } from "../../storage";
import { createDocument } from "../../core/documentOperations";
import { normalizeHexColors } from "../importers/normalizeHexColors";

const MAX_HTML_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 10_000;

const PRESETS = {
  "1080x1080": { width: 1080, height: 1080 },
  "1080x1350": { width: 1080, height: 1350 },
  "letter": undefined, // stick to default Letter path (no custom format)
  "slide-16-9": { width: 1920, height: 1080 },
} as const;

type PresetKey = keyof typeof PRESETS;

export interface ImportHtmlInput {
  html?: string;
  url?: string;
  name?: string;
  destination?: "document";
  format?: {
    preset?: PresetKey;
    width?: number;
    height?: number;
  };
  brandKitId?: string;
  normalizeColors?: boolean;
  sourceUrl?: string;
}

function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) {
    const parts = ip.split(".").map((n) => parseInt(n, 10));
    if (parts.some((n) => Number.isNaN(n))) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 0) return true;
    return false;
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(lower)) return true;
    if (lower.startsWith("::ffff:")) {
      const v4 = lower.slice(7);
      if (net.isIP(v4) === 4) return isPrivateIp(v4);
    }
    return false;
  }
  return true;
}

async function fetchHtmlFromUrl(rawUrl: string): Promise<string> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Response(JSON.stringify({ error: "invalid url" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!/^https?:$/.test(u.protocol)) {
    throw new Response(JSON.stringify({ error: "only http and https URLs are supported" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new Response(JSON.stringify({ error: "url resolves to a blocked host" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) {
      throw new Response(JSON.stringify({ error: "url points to a private ip" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else {
    const addrs = await dns.lookup(host, { all: true }).catch(() => [] as Array<{ address: string }>);
    if (!addrs.length) {
      throw new Response(JSON.stringify({ error: "could not resolve url host" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (addrs.some((a) => isPrivateIp(a.address))) {
      throw new Response(JSON.stringify({ error: "url resolves to a private ip" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(u.href, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "EasyBits-Import/1.0 (+https://www.easybits.cloud)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      throw new Response(JSON.stringify({ error: `url fetch failed with status ${res.status}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const cl = res.headers.get("content-length");
    if (cl && parseInt(cl, 10) > MAX_HTML_BYTES) {
      throw new Response(JSON.stringify({ error: "html too large (max 2MB)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const text = await res.text();
    if (Buffer.byteLength(text, "utf-8") > MAX_HTML_BYTES) {
      throw new Response(JSON.stringify({ error: "html too large (max 2MB)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return text;
  } catch (err) {
    if (err instanceof Response) throw err;
    if ((err as { name?: string })?.name === "AbortError") {
      throw new Response(JSON.stringify({ error: "url fetch timed out" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Response(JSON.stringify({ error: "url fetch failed" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    clearTimeout(timer);
  }
}

// CSS length units (1 CSS inch = 96 px)
function lengthToPx(value: number, unit: string): number {
  switch (unit.toLowerCase()) {
    case "in": return Math.round(value * 96);
    case "cm": return Math.round(value * 37.8);
    case "mm": return Math.round(value * 3.78);
    case "pt": return Math.round(value * 1.333);
    default: return Math.round(value);
  }
}

function detectFormatFromDom(doc: Document): { width: number; height: number } | null {
  // 1. @page { size: ... }
  const styleText = Array.from(doc.querySelectorAll("style")).map(s => s.textContent || "").join("\n");
  const pageMatch = styleText.match(/@page[^{]*\{[^}]*?size\s*:\s*([^;}]+)/i);
  if (pageMatch) {
    const sz = pageMatch[1].trim().toLowerCase();
    if (/letter/.test(sz)) return null; // default letter
    if (/a4/.test(sz)) return { width: 794, height: 1123 };
    const m = sz.match(/(\d+(?:\.\d+)?)\s*(in|cm|mm|pt|px)?\s+(\d+(?:\.\d+)?)\s*(in|cm|mm|pt|px)?/);
    if (m) {
      return {
        width: lengthToPx(parseFloat(m[1]), m[2] || "px"),
        height: lengthToPx(parseFloat(m[3]), m[4] || m[2] || "px"),
      };
    }
  }

  // 2. Inspect the first page-like element's dimensions.
  const slide = doc.querySelector<HTMLElement>(
    '[data-slide], [data-page], [aria-roledescription="carousel"] > *, [role="group"][aria-roledescription="slide"], .reveal .slides > section, .slide, .page, .carousel-item, .carousel__slide'
  );
  if (slide) {
    const style = slide.getAttribute("style") || "";
    const wm = style.match(/\bwidth\s*:\s*(\d+(?:\.\d+)?)\s*(px|in|cm|mm|pt)?/i);
    const hm = style.match(/\bheight\s*:\s*(\d+(?:\.\d+)?)\s*(px|in|cm|mm|pt)?/i);
    if (wm && hm) {
      return {
        width: lengthToPx(parseFloat(wm[1]), wm[2] || "px"),
        height: lengthToPx(parseFloat(hm[1]), hm[2] || "px"),
      };
    }
    const cls = slide.getAttribute("class") || "";
    const wTw = cls.match(/\bw-\[(\d+(?:\.\d+)?)(px|in|cm|mm)?\]/);
    const hTw = cls.match(/\bh-\[(\d+(?:\.\d+)?)(px|in|cm|mm)?\]/);
    if (wTw && hTw) {
      return {
        width: lengthToPx(parseFloat(wTw[1]), wTw[2] || "px"),
        height: lengthToPx(parseFloat(hTw[1]), hTw[2] || "px"),
      };
    }
    if (/\baspect-video\b/.test(cls)) return { width: 1920, height: 1080 };
    if (/\baspect-square\b/.test(cls)) return { width: 1080, height: 1080 };
  }

  return null;
}

function extractHeadExtras(doc: Document): string {
  const parts: string[] = [];
  doc.querySelectorAll("head > style").forEach((s) => parts.push(s.outerHTML));
  doc.querySelectorAll('head > link[rel="stylesheet"]').forEach((l) => parts.push(l.outerHTML));
  // Font preconnects are safe to duplicate too.
  doc.querySelectorAll('head > link[rel="preconnect"]').forEach((l) => parts.push(l.outerHTML));
  return parts.join("\n");
}

/**
 * Detect logical page/slide containers inside the imported HTML and return one
 * HTML string per page. Returns `null` when the HTML is a single-page design
 * (caller should keep it as one section).
 */
function splitIntoPages(html: string): { pages: string[]; format: { width: number; height: number } | null } | null {
  let dom: JSDOM;
  try {
    dom = new JSDOM(html);
  } catch {
    return null;
  }
  const doc = dom.window.document;

  const format = detectFormatFromDom(doc);

  const SELECTORS = [
    '[data-slide]',
    '[data-page]',
    '[data-page-number]',
    '[aria-roledescription="carousel"] > *',
    '[role="group"][aria-roledescription="slide"]',
    '.reveal .slides > section',
    '.carousel__slide',
    '.carousel-item',
    '.slide',
    '.page',
  ];

  let candidates: Element[] = [];
  for (const sel of SELECTORS) {
    const els = Array.from(doc.querySelectorAll(sel));
    if (els.length >= 2) { candidates = els; break; }
  }

  if (!candidates.length && doc.body) {
    const topLevel = Array.from(doc.body.children).filter(
      (el) => el.tagName === "SECTION" || el.tagName === "ARTICLE"
    );
    if (topLevel.length >= 2) candidates = topLevel;
  }

  if (candidates.length < 2) return { pages: [], format };

  const headExtras = extractHeadExtras(doc);
  const pages = candidates.map((el) => {
    const body = (el as HTMLElement).outerHTML;
    return headExtras ? `${headExtras}\n${body}` : body;
  });

  return { pages, format };
}

function resolveFormat(input?: ImportHtmlInput["format"]): { width: number; height: number } | undefined {
  if (!input) return undefined;
  if (input.preset && input.preset !== "letter") {
    return PRESETS[input.preset];
  }
  if (input.preset === "letter") return undefined;
  if (typeof input.width === "number" && typeof input.height === "number") {
    if (input.width < 100 || input.width > 10000 || input.height < 100 || input.height > 10000) {
      return undefined;
    }
    return { width: input.width, height: input.height };
  }
  return undefined;
}

function siteBaseUrl(): string {
  return process.env.SITE_URL || "https://www.easybits.cloud";
}

async function saveRawHtmlToLibrary(
  ctx: AuthContext,
  html: string,
  name: string,
  sourceUrl?: string,
): Promise<string> {
  const client = getPlatformDefaultClient();
  const key = `${ctx.user.id}/import-${nanoid(8)}.html`;
  const buffer = Buffer.from(html, "utf-8");
  await client.putObject(key, buffer, "text/html; charset=utf-8");

  const file = await db.file.create({
    data: {
      name: `${name}.html`,
      storageKey: key,
      slug: key,
      size: buffer.length,
      contentType: "text/html",
      ownerId: ctx.user.id,
      access: "private",
      url: "",
      status: "DONE",
      storageProviderId: null,
      ...(sourceUrl ? { source: sourceUrl } : {}),
    },
  });
  return file.id;
}

export async function importHtml(ctx: AuthContext, input: ImportHtmlInput) {
  const urlInput = input.url?.trim();
  const directHtml = (input.html ?? "").trim();
  if (!directHtml && !urlInput) {
    throw new Response(JSON.stringify({ error: "either html or url is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const html = directHtml || (await fetchHtmlFromUrl(urlInput!)).trim();
  if (!html) {
    throw new Response(JSON.stringify({ error: "fetched html is empty" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (Buffer.byteLength(html, "utf-8") > MAX_HTML_BYTES) {
    throw new Response(JSON.stringify({ error: "html too large (max 2MB)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const name = (input.name?.trim() || "Imported design").slice(0, 200);
  const destination = input.destination || "document";
  const sourceUrl = input.sourceUrl || urlInput;
  const explicitFormat = resolveFormat(input.format);

  // 1. Save raw HTML to library (always — verbatim source, unprocessed).
  const fileId = await saveRawHtmlToLibrary(ctx, html, name, sourceUrl);

  // 2. Detect multi-page structure + declared dimensions from the source DOM.
  const split = splitIntoPages(html);
  const rawPages = split && split.pages.length >= 2 ? split.pages : [html];
  const detectedFormat = split?.format || null;
  const format = explicitFormat ?? detectedFormat ?? undefined;

  // 3. Color normalization pipeline (runs per page so each section stays self-contained).
  const normalize = input.normalizeColors !== false;
  let totalReplacements = 0;
  const roleMap: Record<string, string | undefined> = {};
  const processedPages = rawPages.map((pageHtml) => {
    if (!normalize) return pageHtml;
    const r = normalizeHexColors(pageHtml);
    totalReplacements += r.replacements;
    for (const [hex, role] of Object.entries(r.roleMap)) {
      if (role && !roleMap[hex]) roleMap[hex] = role;
    }
    return sanitizeSemanticColors(r.html);
  });
  const colorNormResult = normalize ? { replacements: totalReplacements, roleMap } : null;

  if (destination === "document") {
    const sections = processedPages.map((pageHtml, i) => ({
      id: nanoid(12),
      order: i,
      html: pageHtml,
      type: "imported",
      name: processedPages.length > 1 ? `Página ${i + 1}` : "Imported",
    }));

    const doc = await createDocument(ctx, {
      name,
      sections,
      brandKitId: input.brandKitId,
      format,
      sourceFileId: fileId,
      sourceUrl,
    });

    return {
      fileId,
      documentId: doc.id,
      editorUrl: `${siteBaseUrl()}/dash/documents/${doc.id}`,
      format: format ?? null,
      pagesDetected: processedPages.length,
      formatDetected: detectedFormat,
      colorNormalization: colorNormResult,
    };
  }

  // Fallback (shouldn't happen with MVP schema but defensive).
  return {
    fileId,
    documentId: null,
    editorUrl: null,
    format: format ?? null,
    pagesDetected: processedPages.length,
    formatDetected: detectedFormat,
    colorNormalization: colorNormResult,
  };
}
