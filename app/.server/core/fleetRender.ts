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
// server speaking JSON at /render/{pdf,screenshot} + /audit — so EVERY call 404'd
// and the three fleet render tools were dead in production. Verify against a live
// box (not the docs) before adding a route here.
//
// The box gained url navigation, honored waitMs, real device emulation and
// /audit on 2026-08-17; verified against the baked image on both fierros before
// this module started sending them. A rebake only reaches NEW/cold boxes, so a
// live box may still be running an older image until it recycles.
import type { AuthContext } from "../apiAuth";
import {
  auditOnBox,
  renderOnBox,
  type AuditResult,
  type AuditViewport,
  type RenderPayload,
} from "./renderClient";

export type { AuditResult, AuditViewport } from "./renderClient";

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
  /** Wait this long after load before capturing (clamped box-side to 30s). */
  waitMs?: number;
  /** PDF: print CSS backgrounds (default true). */
  printBackground?: boolean;
}

export interface RenderInput {
  format: RenderFormat;
  /** Render a live public URL (navigated with networkidle by default). */
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
  if (!input.html && !input.url) throw new Error("render needs html or url");
  const o = input.options ?? {};
  // html wins over url, matching the box's own precedence.
  const payload: RenderPayload = input.html ? { html: input.html } : { url: input.url };

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
 * `deviceScaleFactor`/`isMobile` se MANDAN a la caja como `emulate` y viajan a
 * la creación del contexto de Playwright — o sea que un preset "mobile" es un
 * móvil de verdad (densidad de píxeles y touch), no sólo un viewport angosto.
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
  /**
   * Playwright context overrides (userAgent, colorScheme, locale…). Merged OVER
   * the preset's own device emulation.
   */
  emulate?: Record<string, unknown>;
  /**
   * Recortar a UN elemento en vez de a la página entera.
   *
   * Mirar cuesta: una landing móvil con fullPage sale de 1170x2532, y pasar esa
   * tira por un modelo de visión para juzgar UNA tarjeta tarda minutos — así que
   * el agente acaba evitando el único paso que resuelve el caso. El recorte de
   * la tarjeta son ~400x300.
   *
   * Es el complemento de `auditPage`: sus hallazgos traen `dataId`, y lo que axe
   * deja en `incomplete` (texto sobre imagen o gradiente) SÓLO se resuelve
   * mirándolo.
   */
  dataId?: string;
  /** Selector CSS, para cuando el nodo no tiene `data-id`. `dataId` gana. */
  selector?: string;
  /** Margen alrededor del recorte (px). Default 16: el fondo ES el juicio. */
  padding?: number;
}

export interface ScreenshotResult {
  fileId: string;
  url: string;
  width: number;
  height: number;
  contentType: string;
  size: number;
  preset: ScreenshotPreset;
  /** count de <img> rotas que la caja sustituyó */
  broken: number;
  /** Presente si la captura salió prácticamente vacía, o si se recortó por alta. */
  warning?: string;
  /** Alto REAL de la página cuando la captura se recortó para poder mirarse. */
  fullHeight?: number;
}

/**
 * Límite DURO de lado que acepta la API de visión de Anthropic. Una captura por
 * encima de esto no es "grande": es VENENO. El modelo la lee con un Read, el CLI
 * la mete como adjunto en el historial de la conversación, y desde ese momento
 * CADA turno reenvía esa imagen y la API responde `400 Could not process image`
 * — la conversación queda muerta para siempre, no sólo el turno que la capturó.
 * Pasó en producción el 2026-08-31 (grupo Frutopia Ops): un `fullPage` móvil de
 * 1170x17019 mató el hilo durante ~3h hasta podar el adjunto a mano.
 *
 * Se RECORTA (no se escala): a 0.47x un texto de landing deja de leerse, y una
 * captura ilegible no sirve para lo único que existe —verificar el diseño—. El
 * agente recibe el alto real en `fullHeight` y el consejo de usar `dataId`.
 */
const VISION_MAX_SIDE = 8000;

/** Recorta la captura al alto que la visión puede mirar. No-op si ya cabe. */
async function capForVision(
  bytes: Buffer,
  width: number,
  height: number
): Promise<{ bytes: Buffer; width: number; height: number; cropped: boolean }> {
  if (width <= VISION_MAX_SIDE && height <= VISION_MAX_SIDE) {
    return { bytes, width, height, cropped: false };
  }
  try {
    const sharp = (await import("sharp")).default;
    // Ancho fuera de rango (raro: sólo con un viewport enorme) → escalar, que es
    // lo único posible sin perder la mitad de la página. El alto se recorta.
    const scaled = width > VISION_MAX_SIDE
      ? await sharp(bytes).resize({ width: VISION_MAX_SIDE }).png().toBuffer()
      : bytes;
    const meta = await sharp(scaled).metadata();
    const w = meta.width ?? width;
    const h = meta.height ?? height;
    if (h <= VISION_MAX_SIDE) return { bytes: scaled, width: w, height: h, cropped: width > VISION_MAX_SIDE };
    const out = await sharp(scaled)
      .extract({ left: 0, top: 0, width: w, height: VISION_MAX_SIDE })
      .png()
      .toBuffer();
    return { bytes: out, width: w, height: VISION_MAX_SIDE, cropped: true };
  } catch {
    // Nunca fallar la captura por el recorte: vale más una imagen grande que
    // ninguna. El `warning` de abajo sale igual porque se calcula del alto real.
    return { bytes, width, height, cropped: false };
  }
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
  if (!input.html && !input.url) throw new Error("screenshot needs html or url");

  const preset: ScreenshotPreset = input.preset ?? "mobile";
  const device = SCREENSHOT_PRESETS[preset];
  const dims = input.viewport ?? device;
  const fullPage = input.fullPage ?? true;

  // An explicit `viewport` overrides the preset's size but keeps its device
  // character — asking for 390px wide shouldn't silently drop touch/density.
  const emulate = {
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.isMobile,
    ...(input.emulate ?? {}),
  };

  const cropped = Boolean(input.dataId || input.selector);

  const out = await renderOnBox(ctx, "screenshot", {
    ...(input.html ? { html: input.html } : { url: input.url }),
    viewport: { width: Math.round(dims.width), height: Math.round(dims.height) },
    emulate,
    ...(input.waitMs ? { waitMs: Math.round(input.waitMs) } : {}),
    ...(input.dataId ? { dataId: input.dataId } : {}),
    ...(!input.dataId && input.selector ? { selector: input.selector } : {}),
    ...(input.padding != null ? { padding: input.padding } : {}),
    screenshot: { type: "png", fullPage },
  });

  // Dimensiones reales del PNG (IHDR) — con fullPage el alto no es el del viewport.
  const rawWidth = out.bytes.length > 24 ? out.bytes.readUInt32BE(16) : dims.width;
  const rawHeight = out.bytes.length > 24 ? out.bytes.readUInt32BE(20) : dims.height;

  // El cap va ANTES de guardar: el archivo que se almacena es el que el agente va
  // a mirar, y guardar uno que la visión no puede procesar sólo aplaza el fallo.
  const capped = await capForVision(out.bytes, rawWidth, rawHeight);
  const { bytes: shotBytes, width, height } = capped;

  const stored = await storeRender(
    ctx,
    shotBytes,
    "image/png",
    input.fileName || input.url || `screenshot-${preset}`,
    "png"
  );

  // En un recorte, un solo color es un resultado PLAUSIBLE (un badge, un bloque
  // de fondo) — avisar ahí entrenaría al agente a desconfiar de capturas buenas.
  const blank = cropped ? false : await looksBlank(shotBytes);
  return {
    ...stored,
    width,
    height,
    contentType: "image/png",
    size: shotBytes.length,
    preset,
    broken: out.broken,
    ...(capped.cropped ? { fullHeight: rawHeight } : {}),
    ...(blank
      ? {
          warning:
            "la captura salió de un solo color (probablemente en blanco): el CSS quizá no había pintado. " +
            "Sube `waitMs`, o inline el CSS si viene de un CDN lento.",
        }
      : capped.cropped
        ? {
            warning:
              `la página mide ${rawWidth}x${rawHeight}px y la visión no puede mirar más de ${VISION_MAX_SIDE}px por lado: ` +
              `se guardó recortada a los primeros ${height}px. Para ver el resto, captura por partes con \`dataId\` (o \`selector\`).`,
          }
        : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// audit_page — medir accesibilidad y layout, en vez de adivinarlos.
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditInput {
  url?: string;
  /** Gana sobre `url`. */
  html?: string;
  /** Default: mobile 390 · tablet 768 · desktop 1440 (los que aplica la caja). */
  viewports?: AuditViewport[];
  waitMs?: number;
}

/** Cuántos viewports audita realmente una petición — la caja cobra por viewport. */
export const DEFAULT_AUDIT_VIEWPORTS = 3;

export function auditViewportCount(input: Pick<AuditInput, "viewports">): number {
  return input.viewports?.length || DEFAULT_AUDIT_VIEWPORTS;
}

/**
 * Audita una página en la caja: axe-core sobre el DOM PINTADO (contraste real,
 * no estimado) más medición de layout, a N viewports.
 *
 * No sube nada a Files — el valor es el JSON, y `dataId` apunta al nodo exacto
 * para que el agente lo parche con `patch_node`.
 */
export async function auditPage(ctx: AuthContext, input: AuditInput): Promise<AuditResult> {
  if (!input.html && !input.url) throw new Error("audit needs html or url");
  return auditOnBox(ctx, {
    ...(input.html ? { html: input.html } : { url: input.url }),
    ...(input.waitMs ? { waitMs: Math.round(input.waitMs) } : {}),
    ...(input.viewports?.length ? { viewports: input.viewports } : {}),
  });
}

/** @deprecated misleading name — the box is not Gotenberg. Use renderViaBoxAndStore. */
export const renderViaGotenbergBox = renderViaBoxAndStore;
