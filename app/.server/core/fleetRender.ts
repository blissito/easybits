// Fleet render — channel-agnostic HTML → PDF/PNG for FleetAgents.
// Mirrors fleetVoice.ts: consumes the on-demand render-svc box keyed per-owner.
// No browser logic here — we POST the box's JSON contract (renderClient.ts owns
// the transport) and upload the bytes to the owner's Files, returning a public
// URL the agent can send to the chat as an attachment.
//
// This is the Chromium-class path ONLY. Structured docs (facturas, cotizaciones,
// reportes JSON) go through `structured_doc`/@react-pdf/renderer in-process — NOT
// here.
//
// ⚠️ HISTORY: until 2026-08-17 this module POSTed Gotenberg multipart routes
// (/forms/chromium/…). The render-svc box does not serve them — it is a Chromium
// server speaking JSON at /render/{pdf,screenshot} — so EVERY call 404'd and the
// three fleet render tools were dead in production. Verify against a live box
// (not the docs) before adding a route here.
import type { AuthContext } from "../apiAuth";
import { renderOnBox, type RenderPayload } from "./renderClient";

export type RenderFormat = "pdf" | "png";

// Option vocabulary modeled on ScreenshotOne/Urlbox. Mapped to the box's
// Playwright-shaped payload in buildPayload().
export interface RenderOptions {
  /** Screenshot: capture the full scrollable page. */
  fullPage?: boolean;
  /** Screenshot viewport width/height (px). */
  width?: number;
  height?: number;
  /** PDF: landscape orientation. */
  landscape?: boolean;
  /** PDF: paper size in inches (defaults to US Letter on the box side). */
  paperWidth?: number;
  paperHeight?: number;
  /**
   * Wait this long after load before capturing.
   * ⚠️ NOT HONORED by the current box build — measured 2026-08-17: identical
   * bytes for waitMs 0 vs 3000. The box captures at load. Kept in the API so
   * callers can express intent (and so it starts working the day the template
   * gains it), but never promise the wait happened — see `waitHonored` in the
   * tool responses.
   */
  waitMs?: number;
  /** PDF: print CSS backgrounds (default true). */
  printBackground?: boolean;
}

/** The box captures at load; it does not honor waitMs/waitAssets yet. */
export const BOX_HONORS_WAIT = false;

export interface RenderInput {
  format: RenderFormat;
  /**
   * Render a live public URL.
   * ⚠️ NOT SUPPORTED by the current box build — it answers 400 "missing html".
   * Throws a clear error until the template gains navigation.
   */
  url?: string;
  /** Render self-contained HTML. */
  html?: string;
  /** Optional output base name (for the File row). */
  fileName?: string;
  options?: RenderOptions;
}

export interface RenderResult {
  fileId: string;
  url: string;
  contentType: string;
  size: number;
  /** count of <img> that failed to load and were swapped for a placeholder */
  broken: number;
}

function buildPayload(input: RenderInput): RenderPayload {
  if (!input.html) throw new Error("render needs html");
  const o = input.options ?? {};
  const payload: RenderPayload = { html: input.html };

  if (o.width || o.height) {
    payload.viewport = { width: Math.round(o.width ?? 1280), height: Math.round(o.height ?? 800) };
  }
  if (o.waitMs) payload.waitMs = Math.round(o.waitMs);

  if (input.format === "png") {
    payload.screenshot = { type: "png", ...(o.fullPage != null ? { fullPage: o.fullPage } : {}) };
  } else {
    payload.pdf = {
      printBackground: o.printBackground ?? true,
      ...(o.landscape != null ? { landscape: o.landscape } : {}),
      ...(o.paperWidth && o.paperHeight
        ? { width: `${o.paperWidth}in`, height: `${o.paperHeight}in` }
        : { format: "Letter" }),
    };
  }
  return payload;
}

/**
 * Render via the owner's on-demand render box and persist the result to the
 * owner's Files. Throws (with the box's status + route) when it can't.
 */
export async function renderViaBoxAndStore(
  ctx: AuthContext,
  input: RenderInput
): Promise<RenderResult> {
  if (input.url && !input.html) {
    throw new Error(
      "esta caja de render aún no navega URLs (responde 400 \"missing html\"). " +
        "Usa render_html pasando el HTML completo y auto-contenido."
    );
  }

  const isPdf = input.format !== "png";
  const out = await renderOnBox(ctx, isPdf ? "pdf" : "screenshot", buildPayload(input));
  const contentType = isPdf ? "application/pdf" : "image/png";

  const { uploadFile } = await import("./operations");
  const ext = isPdf ? "pdf" : "png";
  const rawBase = input.fileName || input.url || "render";
  const base =
    rawBase.replace(/^https?:\/\//, "").slice(0, 40).replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "") ||
    "render";
  const fileName = `${base}.${ext}`;
  const { file, putUrl } = await uploadFile(ctx, {
    fileName,
    contentType,
    size: out.bytes.length,
    access: "public",
    source: "render",
  });
  const put = await fetch(putUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: new Uint8Array(out.bytes),
  });
  if (!put.ok) throw new Error(`render upload failed: ${put.status}`);
  return {
    fileId: file.id,
    url: file.url || "",
    contentType,
    size: out.bytes.length,
    broken: out.broken,
  };
}

/** @deprecated misleading name — the box is not Gotenberg. Use renderViaBoxAndStore. */
export const renderViaGotenbergBox = renderViaBoxAndStore;
