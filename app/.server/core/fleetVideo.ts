// Fleet video — HTML (HyperFrames composition) → MP4 for FleetAgents / API.
// Mirrors fleetRender.ts: consumes the on-demand hyperframes-svc box (HyperFrames
// by HeyGen, Apache 2.0) keyed per-owner. The box drives chrome-headless-shell +
// ffmpeg to render a self-contained composition; no browser logic here — we just
// POST the HTML and upload the MP4 bytes to the owner's Files, returning a public
// URL the caller/agent can send as an attachment.
//
// The composition contract (validated locally): a self-contained HTML document
// with a root `<div data-composition-id data-start data-duration data-width
// data-height data-fps>` and `class="clip"` children carrying data-start/
// data-duration/data-track-index, plus a paused GSAP timeline registered on
// `window.__timelines`. Infinite tweens (repeat:-1) break deterministic capture —
// callers must use finite repeats. See templates/hyperframes-svc/server.mjs.
import type { AuthContext } from "../apiAuth";
import { ensureServiceBox, touchServiceBox } from "./fleetServiceOperations";

/** An asset the box downloads into the project's assets/ dir before rendering. */
export interface VideoAsset {
  /** Filename under assets/ (referenced as assets/<name> in indexHtml/scenes). */
  name: string;
  /** Public URL the box fetches over HTTP (no auth). */
  url: string;
}

export interface VideoInput {
  /**
   * Host composition HTML. Prefer `indexHtml`; `html` is the backward-compatible
   * alias for a single self-contained composition (no assets/scenes).
   */
  html?: string;
  /** Host composition HTML (the project's index.html). */
  indexHtml?: string;
  /** Optional sub-compositions written to compositions/<id>.html (id ^[\w-]+$). */
  scenes?: { id: string; html: string }[];
  /** Images/other media the box downloads into assets/ (referenced as assets/<name>). */
  assets?: VideoAsset[];
  /**
   * Background audio track. HyperFrames muxes audio ONLY from a real file, so the
   * box downloads this to assets/<name>; indexHtml must carry
   * `<audio id=... src="assets/<name>">` at the composition root.
   */
  audio?: VideoAsset;
  /** Frame rate (1-240). Defaults to the composition's data-fps, else 30. */
  fps?: number;
  /** Render quality. Default "standard". */
  quality?: "draft" | "standard" | "high";
  /** Output resolution preset (must match the composition aspect ratio). */
  resolution?: string;
  /** Output container. Default "mp4"; "webm" renders with transparency. */
  format?: "mp4" | "webm";
  /** Optional output base name (for the File row). */
  fileName?: string;
}

export interface VideoResult {
  fileId: string;
  url: string;
  contentType: string;
  size: number;
  /** Wall-clock render time reported by the box (x-render-ms), if present. */
  renderMs?: number;
}

async function ensureBox(
  ctx: AuthContext
): Promise<{ videoUrl?: string; sandboxId: string } | null> {
  return ensureServiceBox(ctx, "video").catch((e) => {
    console.error("[video] ensureBox FAILED:", (e as Error)?.message || e);
    return null;
  });
}

async function postRender(
  videoUrl: string,
  input: VideoInput
): Promise<{ bytes: Buffer; contentType: string; renderMs?: number } | null> {
  const body = JSON.stringify({
    indexHtml: input.indexHtml || input.html,
    scenes: input.scenes,
    assets: input.assets,
    audio: input.audio,
    fps: input.fps,
    quality: input.quality,
    resolution: input.resolution,
    format: input.format,
  });
  try {
    const r = await fetch(`${videoUrl.replace(/\/$/, "")}/render`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      // Video renders are slow; the box hard-caps at 240s internally.
      signal: AbortSignal.timeout(300_000),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error(`[video] hyperframes http=${r.status} ${detail.slice(0, 2000)}`);
      return null;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) {
      console.error("[video] hyperframes empty body");
      return null;
    }
    const renderMs = Number(r.headers.get("x-render-ms")) || undefined;
    const contentType = r.headers.get("content-type") || "video/mp4";
    return { bytes: buf, contentType, renderMs };
  } catch (e) {
    console.error("[video] hyperframes fetch FAILED:", (e as Error)?.message || e);
    return null;
  }
}

// Render an HTML composition via the owner's on-demand HyperFrames box and persist
// the MP4 to the owner's Files. Throws when the box can't be brought up or returns
// no bytes.
export async function renderViaHyperframesBox(
  ctx: AuthContext,
  input: VideoInput
): Promise<VideoResult> {
  if (!input.indexHtml?.trim() && !input.html?.trim())
    throw new Error("video render needs indexHtml (or html)");

  const box = await ensureBox(ctx);
  if (!box?.videoUrl) throw new Error("video box unavailable (host down or plan cap)");

  const out = await postRender(box.videoUrl, input);
  void touchServiceBox(box.sandboxId);
  if (!out) throw new Error("video render failed (box returned no bytes)");

  const { uploadFile } = await import("./operations");
  const ext = out.contentType.includes("webm") ? "webm" : "mp4";
  const rawBase = input.fileName || "video";
  const base =
    rawBase.slice(0, 40).replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "") || "video";
  const fileName = `${base}.${ext}`;

  const { file, putUrl } = await uploadFile(ctx, {
    fileName,
    contentType: out.contentType,
    size: out.bytes.length,
    access: "public",
    source: "video",
  });
  const put = await fetch(putUrl, {
    method: "PUT",
    headers: { "content-type": out.contentType },
    body: new Uint8Array(out.bytes),
  });
  if (!put.ok) throw new Error(`video upload failed: ${put.status}`);

  return {
    fileId: file.id,
    url: file.url || "",
    contentType: out.contentType,
    size: out.bytes.length,
    renderMs: out.renderMs,
  };
}
