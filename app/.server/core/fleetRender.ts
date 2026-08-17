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

const URL_UNSUPPORTED =
  'esta caja de render aún no navega URLs (responde 400 "missing html"). ' +
  "Pasa el HTML completo y auto-contenido.";

/** Sube los bytes a los Files del owner y devuelve el File público. */
async function storeRender(
  ctx: AuthContext,
  bytes: Buffer,
  contentType: string,
  nameBase: string,
  ext: string
): Promise<{ fileId: string; url: string }> {
  const { uploadFile } = await import("./operations");
  const base =
    nameBase.replace(/^https?:\/\//, "").slice(0, 40).replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "") ||
    "render";
  const { file, putUrl } = await uploadFile(ctx, {
    fileName: `${base}.${ext}`,
    contentType,
    size: bytes.length,
    access: "public",
    source: "render",
  });
  const put = await fetch(putUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: new Uint8Array(bytes),
  });
  if (!put.ok) throw new Error(`render upload failed: ${put.status}`);
  return { fileId: file.id, url: file.url || "" };
}

/**
 * Render via the owner's on-demand render box and persist the result to the
 * owner's Files. Throws (with the box's status + route) when it can't.
 */
export async function renderViaBoxAndStore(
  ctx: AuthContext,
  input: RenderInput
): Promise<RenderResult> {
  if (input.url && !input.html) throw new Error(URL_UNSUPPORTED);

  const isPdf = input.format !== "png";
  const out = await renderOnBox(ctx, isPdf ? "pdf" : "screenshot", buildPayload(input));
  const contentType = isPdf ? "application/pdf" : "image/png";
  const stored = await storeRender(
    ctx,
    out.bytes,
    contentType,
    input.fileName || input.url || "render",
    isPdf ? "pdf" : "png"
  );
  return { ...stored, contentType, size: out.bytes.length, broken: out.broken };
}

// ─────────────────────────────────────────────────────────────────────────────
// screenshot_url — ver una página como la ve un humano.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `mobile` es el DEFAULT a propósito: es el peor caso y donde se rompen las
 * landings (texto cortado, rejillas que desbordan).
 *
 * ⚠️ `deviceScaleFactor` está aquí como INTENCIÓN, no como hecho: la caja lo
 * ignora (medido 2026-08-17 en sus 4 formas). Hasta que el template lo soporte,
 * un preset "mobile" es ancho de viewport, NO emulación de dispositivo — y la
 * respuesta lo declara con `mobileEmulation:false`.
 */
export const SCREENSHOT_PRESETS = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 2, isMobile: false },
} as const;

export type ScreenshotPreset = keyof typeof SCREENSHOT_PRESETS;

export interface ScreenshotInput {
  url?: string;
  /** Gana sobre `url` — permite ver un borrador SIN publicarlo. */
  html?: string;
  preset?: ScreenshotPreset;
  /** Gana sobre `preset`. */
  viewport?: { width: number; height: number };
  /** Default true. */
  fullPage?: boolean;
  waitMs?: number;
  fileName?: string;
}

export interface ScreenshotResult {
  fileId: string;
  url: string;
  width: number;
  height: number;
  contentType: string;
  size: number;
  preset: ScreenshotPreset;
  /** false mientras la caja no emule dispositivo: viste un viewport angosto, no un móvil. */
  mobileEmulation: boolean;
  /** false mientras la caja capture al `load` sin esperar. */
  waitHonored: boolean;
  /** count de <img> rotas que la caja sustituyó */
  broken: number;
  /** Presente si la captura salió prácticamente vacía. */
  warning?: string;
}

/**
 * ¿La imagen es de un solo color? Es la diferencia entre "rompí la página" y
 * "el CSS todavía no había pintado" — sin esta señal el agente concluye lo
 * primero y deshace un trabajo que estaba bien.
 */
async function looksBlank(bytes: Buffer): Promise<boolean> {
  try {
    const sharp = (await import("sharp")).default;
    const { channels } = await sharp(bytes).stats();
    // stdev ~0 en todos los canales = un único color en todo el lienzo.
    return channels.length > 0 && channels.every((c) => c.stdev < 1);
  } catch {
    return false; // nunca fallar la captura por el detector
  }
}

/**
 * Captura cómo SE VE una página (URL pública o HTML sin publicar) y la guarda en
 * los Files del owner, lista para encadenar a una tool de visión.
 */
export async function captureScreenshot(
  ctx: AuthContext,
  input: ScreenshotInput
): Promise<ScreenshotResult> {
  if (!input.html) {
    // La caja no navega: sin html no hay captura posible (ni con url).
    throw new Error(input.url ? URL_UNSUPPORTED : "screenshot needs html or url");
  }
  const preset: ScreenshotPreset = input.preset ?? "mobile";
  const dims = input.viewport ?? SCREENSHOT_PRESETS[preset];
  const fullPage = input.fullPage ?? true;

  const out = await renderOnBox(ctx, "screenshot", {
    html: input.html,
    viewport: { width: Math.round(dims.width), height: Math.round(dims.height) },
    ...(input.waitMs ? { waitMs: Math.round(input.waitMs) } : {}),
    screenshot: { type: "png", fullPage },
  });

  const stored = await storeRender(
    ctx,
    out.bytes,
    "image/png",
    input.fileName || input.url || `screenshot-${preset}`,
    "png"
  );

  // Dimensiones reales del PNG (IHDR) — con fullPage el alto no es el del viewport.
  const width = out.bytes.length > 24 ? out.bytes.readUInt32BE(16) : dims.width;
  const height = out.bytes.length > 24 ? out.bytes.readUInt32BE(20) : dims.height;

  const blank = await looksBlank(out.bytes);
  return {
    ...stored,
    width,
    height,
    contentType: "image/png",
    size: out.bytes.length,
    preset,
    mobileEmulation: false,
    waitHonored: BOX_HONORS_WAIT,
    broken: out.broken,
    ...(blank
      ? {
          warning:
            "la captura salió de un solo color (probablemente en blanco): el CSS quizá no había pintado. " +
            "Si el HTML carga Tailwind por CDN, hornéalo antes de capturar — esta caja NO espera.",
        }
      : {}),
  };
}

/** @deprecated misleading name — the box is not Gotenberg. Use renderViaBoxAndStore. */
export const renderViaGotenbergBox = renderViaBoxAndStore;
