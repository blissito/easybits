// Fleet render — channel-agnostic HTML/URL/office → PDF/PNG for FleetAgents.
// Mirrors fleetVoice.ts: consumes the on-demand render-svc box (Gotenberg, MIT)
// keyed per-owner. Gotenberg drives Chromium (URL/HTML→PDF + screenshots) and
// LibreOffice (office→PDF). No browser logic here — we just POST multipart and
// upload the bytes to the owner's Files, returning a public URL the agent can
// send to the chat as an attachment.
//
// This is the Chromium-class path ONLY. Structured docs (facturas, cotizaciones,
// reportes JSON) go through `structured_doc`/@react-pdf/renderer in-process — NOT
// here. EasyBits documents (Landing v4) keep their Playwright path.
import type { AuthContext } from "../apiAuth";
import { ensureServiceBox, touchServiceBox } from "./fleetServiceOperations";

export type RenderFormat = "pdf" | "png";

// Option vocabulary modeled on ScreenshotOne/Urlbox/Gotenberg. Mapped to
// Gotenberg form fields in buildForm().
export interface RenderOptions {
  /** Screenshot: capture the full scrollable page (Gotenberg clip=false). */
  fullPage?: boolean;
  /** Screenshot viewport width/height (px). */
  width?: number;
  height?: number;
  /** PDF: landscape orientation. */
  landscape?: boolean;
  /** PDF: paper size in inches (defaults to US Letter on the Gotenberg side). */
  paperWidth?: number;
  paperHeight?: number;
  /** Wait this long after load before capturing (lets late JS settle). */
  waitMs?: number;
  /** PDF: print CSS backgrounds (default true). */
  printBackground?: boolean;
}

export interface RenderInput {
  format: RenderFormat;
  /** Render a live public URL. */
  url?: string;
  /** Render self-contained HTML. */
  html?: string;
  /** Convert an office document (docx/xlsx/pptx/…) to PDF (forces format=pdf). */
  fileUrl?: string;
  /** Optional output base name (for the File row). */
  fileName?: string;
  options?: RenderOptions;
}

export interface RenderResult {
  fileId: string;
  url: string;
  contentType: string;
  size: number;
}

async function ensureBox(
  ctx: AuthContext
): Promise<{ renderUrl?: string; sandboxId: string } | null> {
  return ensureServiceBox(ctx, "render").catch((e) => {
    console.error("[render] ensureBox FAILED:", (e as Error)?.message || e);
    return null;
  });
}

function gotenbergRoute(input: RenderInput): { path: string; isPdf: boolean } {
  if (input.fileUrl) return { path: "/forms/libreoffice/convert", isPdf: true };
  const kind = input.url ? "url" : "html";
  if (input.format === "png")
    return { path: `/forms/chromium/screenshot/${kind}`, isPdf: false };
  return { path: `/forms/chromium/convert/${kind}`, isPdf: true };
}

async function buildForm(input: RenderInput): Promise<FormData> {
  const fd = new FormData();
  const o = input.options ?? {};

  // office → pdf: fetch the source bytes and attach as `files`.
  if (input.fileUrl) {
    const r = await fetch(input.fileUrl, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`fetch office file failed: ${r.status}`);
    const bytes = Buffer.from(await r.arrayBuffer());
    const name = input.fileName || input.fileUrl.split("/").pop() || "document";
    fd.append("files", new Blob([new Uint8Array(bytes)]), name);
    return fd;
  }

  if (input.url) {
    fd.append("url", input.url);
  } else if (input.html) {
    fd.append("files", new Blob([input.html], { type: "text/html" }), "index.html");
  } else {
    throw new Error("render needs url, html, or fileUrl");
  }

  if (input.format === "png") {
    fd.append("format", "png");
    if (o.width) fd.append("width", String(Math.round(o.width)));
    if (o.height) fd.append("height", String(Math.round(o.height)));
    // Gotenberg: clip=false captures the full page; clip=true clips to width/height.
    if (o.fullPage != null) fd.append("clip", String(!o.fullPage));
    if (o.waitMs) fd.append("waitDelay", `${Math.round(o.waitMs)}ms`);
  } else {
    if (o.landscape != null) fd.append("landscape", String(o.landscape));
    fd.append("printBackground", String(o.printBackground ?? true));
    if (o.paperWidth) fd.append("paperWidth", String(o.paperWidth));
    if (o.paperHeight) fd.append("paperHeight", String(o.paperHeight));
    if (o.waitMs) fd.append("waitDelay", `${Math.round(o.waitMs)}ms`);
  }
  return fd;
}

async function postGotenberg(
  renderUrl: string,
  route: string,
  form: FormData,
  isPdf: boolean
): Promise<{ bytes: Buffer; contentType: string } | null> {
  try {
    const r = await fetch(`${renderUrl.replace(/\/$/, "")}${route}`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error(`[render] gotenberg http=${r.status} route=${route} ${detail.slice(0, 300)}`);
      return null;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) {
      console.error("[render] gotenberg empty body");
      return null;
    }
    return { bytes: buf, contentType: isPdf ? "application/pdf" : "image/png" };
  } catch (e) {
    console.error(`[render] gotenberg fetch FAILED route=${route}:`, (e as Error)?.message || e);
    return null;
  }
}

// Render via the owner's on-demand Gotenberg box and persist the result to the
// owner's Files. Throws when the box can't be brought up or returns no bytes.
export async function renderViaGotenbergBox(
  ctx: AuthContext,
  input: RenderInput
): Promise<RenderResult> {
  const box = await ensureBox(ctx);
  if (!box?.renderUrl) throw new Error("render box unavailable (host down or plan cap)");

  const { path: route, isPdf } = gotenbergRoute(input);
  const form = await buildForm(input);
  const out = await postGotenberg(box.renderUrl, route, form, isPdf);
  void touchServiceBox(box.sandboxId);
  if (!out) throw new Error("render failed (gotenberg box returned no bytes)");

  const { uploadFile } = await import("./operations");
  const ext = isPdf ? "pdf" : "png";
  const rawBase = input.fileName || input.url || input.fileUrl || "render";
  const base =
    rawBase.replace(/^https?:\/\//, "").slice(0, 40).replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "") ||
    "render";
  const fileName = `${base}.${ext}`;
  const { file, putUrl } = await uploadFile(ctx, {
    fileName,
    contentType: out.contentType,
    size: out.bytes.length,
    access: "public",
    source: "render",
  });
  const put = await fetch(putUrl, {
    method: "PUT",
    headers: { "content-type": out.contentType },
    body: new Uint8Array(out.bytes),
  });
  if (!put.ok) throw new Error(`render upload failed: ${put.status}`);
  return { fileId: file.id, url: file.url || "", contentType: out.contentType, size: out.bytes.length };
}
