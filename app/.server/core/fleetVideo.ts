// Fleet video — HTML (HyperFrames composition) → MP4 for FleetAgents / API.
// Mirrors fleetRender.ts: consumes the on-demand video-svc box (HyperFrames
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
// callers must use finite repeats. See templates/video-svc/server.mjs.
import type { AuthContext } from "../apiAuth";
import { nanoid } from "nanoid";
import { db } from "../db";
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

// ─────────────────────────────────────────────────────────────────────────────
// Quitar fondo (BiRefNet) — job asíncrono en la MISMA caja de video.
//
// La caja de EasyBits no tiene credenciales de storage (el spec `video` no pasa
// env), así que la app elige la llave en el bucket público, le da a la caja una URL
// de PUT prefirmada y registra el File cuando lee el estado `done`. El jobId que
// ve el agente lleva la llave adentro (`bg_<jobIdDeLaCaja>_<llave>`): no hace falta
// tabla, y como la llave siempre se arma con el ownerId del ctx, un jobId ajeno no
// apunta a archivos de otra cuenta.
//
// Lento a propósito del modelo: ~22 s por cuadro con 4 vCPU (medido). Una imagen
// cabe en un turno; un video son minutos u horas y se consulta en turnos después.
// ─────────────────────────────────────────────────────────────────────────────

export interface RemoveBackgroundInput {
  /** URL https pública de la imagen o el video. */
  url?: string;
  /** O un archivo de Files del owner. */
  fileId?: string;
  /** Imagen → "png" (único). Video → "mov" (ProRes 4444 con alfa, default) o "png-zip". */
  format?: "png" | "mov" | "png-zip";
  /** Video: cuadros por segundo a procesar (baja el costo; default el del video). */
  fps?: number;
  /** Video: segundo de inicio del tramo. */
  start?: number;
  /** Video: duración del tramo en segundos. */
  duration?: number;
  /** Video → mov: conservar el audio original. Default true. */
  keepAudio?: boolean;
  /** Nombre base del archivo de salida. */
  fileName?: string;
}

export interface RemoveBackgroundStatus {
  jobId: string;
  state: "queued" | "running" | "done" | "failed";
  step?: string;
  error?: string | null;
  detail?: Record<string, unknown>;
  fileId?: string;
  url?: string;
  contentType?: string;
  size?: number;
}

const BG_JOB_RE = /^bg_([0-9a-f-]{36})_([A-Za-z0-9_-]{12})$/;
// La URL de PUT tiene que sobrevivir a la cola + la inferencia. 6 h = el TTL de los
// jobs en la caja: un job que tarde más ya no se puede leer de todos modos.
const BG_PUT_TTL_S = 6 * 60 * 60;

async function sourceUrlFor(ctx: AuthContext, input: RemoveBackgroundInput): Promise<string> {
  if (input.fileId) {
    const file = await db.file.findUnique({ where: { id: input.fileId } });
    if (!file || file.ownerId !== ctx.user.id) throw new Error("archivo no encontrado");
    if (file.access === "public" && file.url) return file.url;
    const { getReadClientForPlatformFile, getClientForFile } = await import("../storage");
    const client = file.storageProviderId
      ? await getClientForFile(file.storageProviderId, ctx.user.id)
      : getReadClientForPlatformFile(file);
    return client.getReadUrl(file.storageKey, BG_PUT_TTL_S);
  }
  const url = input.url?.trim();
  if (!url || !/^https:\/\//i.test(url)) throw new Error("pasa `fileId` o una `url` https pública");
  return url;
}

/** Encola el recorte en la caja de video del owner. Devuelve al instante. */
export async function startRemoveBackground(
  ctx: AuthContext,
  input: RemoveBackgroundInput
): Promise<{ jobId: string; state: string }> {
  const url = await sourceUrlFor(ctx, input);
  const box = await ensureBox(ctx);
  if (!box?.videoUrl) throw new Error("video box unavailable (host down or plan cap)");

  const keyId = nanoid(12).replace(/[^A-Za-z0-9_-]/g, "_");
  const storageKey = `${ctx.user.id}/${keyId}`;
  const { getPlatformPublicClient } = await import("../storage");
  const putUrl = await getPlatformPublicClient().getPutUrl(storageKey, { timeout: BG_PUT_TTL_S });

  const r = await fetch(`${box.videoUrl}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "remove-background",
      url,
      putUrl,
      format: input.format,
      fps: input.fps,
      start: input.start,
      duration: input.duration,
      keepAudio: input.keepAudio,
      name: input.fileName,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  void touchServiceBox(box.sandboxId);
  const body = (await r.json().catch(() => ({}))) as { jobId?: string; state?: string; error?: string };
  if (!r.ok || !body.jobId) throw new Error(body.error || `la caja de video contestó ${r.status}`);
  return { jobId: `bg_${body.jobId}_${keyId}`, state: body.state || "queued" };
}

/**
 * Estado del recorte. Al primer `done` registra el File (idempotente por storageKey)
 * y devuelve `{fileId, url}`.
 */
export async function removeBackgroundStatus(ctx: AuthContext, jobId: string): Promise<RemoveBackgroundStatus> {
  const m = BG_JOB_RE.exec(jobId || "");
  if (!m) throw new Error("jobId inválido (es el `bg_…` que devolvió remove_background)");
  const [, boxJobId, keyId] = m;
  const storageKey = `${ctx.user.id}/${keyId}`;

  const box = await ensureBox(ctx);
  if (!box?.videoUrl) throw new Error("video box unavailable (host down or plan cap)");
  const r = await fetch(`${box.videoUrl}/jobs/${boxJobId}`, { signal: AbortSignal.timeout(30_000) });
  void touchServiceBox(box.sandboxId);
  if (r.status === 404) {
    // La caja se recicló o pasó el TTL. Si el archivo alcanzó a subir, igual se entrega.
    const existing = await db.file.findFirst({ where: { storageKey, ownerId: ctx.user.id } });
    if (existing) return fileStatus(jobId, existing);
    throw new Error("job desconocido o caducado (la caja de video se recicló o pasaron 6 h)");
  }
  const j = (await r.json().catch(() => ({}))) as {
    state?: RemoveBackgroundStatus["state"];
    step?: string;
    error?: string | null;
    size?: number | null;
    detail?: Record<string, unknown>;
  };
  const out: RemoveBackgroundStatus = {
    jobId,
    state: j.state || "failed",
    step: j.step,
    error: j.error,
    detail: j.detail,
  };
  if (out.state !== "done") return out;

  const existing = await db.file.findFirst({ where: { storageKey, ownerId: ctx.user.id } });
  if (existing) return { ...out, ...fileStatus(jobId, existing) };

  const { getPlatformPublicClient, buildPublicAssetUrl } = await import("../storage");
  const head = await getPlatformPublicClient().headObject(storageKey);
  if (!head?.size) throw new Error("la caja dijo listo pero el archivo no está en el storage");
  const name = String(j.detail?.name || "sin-fondo.png");
  const contentType = String(j.detail?.mime || "application/octet-stream");
  let file;
  try {
    file = await db.file.create({
      data: {
        name,
        storageKey,
        slug: storageKey,
        size: head.size,
        contentType,
        ownerId: ctx.user.id,
        access: "public",
        url: buildPublicAssetUrl(storageKey),
        status: "DONE",
        source: "remove-background",
      },
    });
  } catch (e: any) {
    // Dos lecturas del estado a la vez: la otra ya lo registró (storageKey es único).
    if (e?.code !== "P2002") throw e;
    file = await db.file.findFirst({ where: { storageKey, ownerId: ctx.user.id } });
    if (!file) throw e;
  }
  return { ...out, ...fileStatus(jobId, file) };
}

function fileStatus(
  jobId: string,
  f: { id: string; url: string | null; contentType: string; size: number }
): RemoveBackgroundStatus {
  return { jobId, state: "done", fileId: f.id, url: f.url || "", contentType: f.contentType, size: f.size };
}
