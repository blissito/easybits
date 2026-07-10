// Video projects — a stateful, doc-style resource of ordered scenes that
// compiles to a HyperFrames composition and renders to MP4 via the on-demand
// hyperframes-svc box (see fleetVideo.ts). Mirrors documentOperations.ts: every
// mutation is ownership-guarded, keeps a previousScenes undo snapshot, and is a
// no-op when nothing changes.
//
// Compile strategy = the MODULAR orchestrator pattern (hyperframes-core
// composition-patterns.md): a thin root composition declares one sub-composition
// slot per scene at a sequential data-start, mounts a continuous <audio> at the
// root, and registers a near-empty root timeline. Each scene is authored as a
// self-contained sub-comp with its OWN paused GSAP timeline. This keeps scenes
// independent so add/insert/reorder/delete are pure array ops.
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { renderViaHyperframesBox, type VideoInput } from "./fleetVideo";

// ---- Types ------------------------------------------------------------------

export interface VideoScene {
  /** Stable id (uuid). Doubles as the sub-composition id + filename — must be ^[\w-]+$. */
  id: string;
  order: number;
  label?: string;
  /** Seconds this scene is on screen. */
  durationSec: number;
  /**
   * Scene markup (+ optional scoped <style>). Positioned to fill the frame.
   * Reference bundled media as assets/<name>. NO <script>, NO id/registry
   * boilerplate — the compiler wraps this into a sub-composition.
   */
  html: string;
  /**
   * Optional GSAP snippet run against a pre-declared paused timeline `tl`
   * (e.g. `tl.from('#title',{opacity:0,y:40,duration:0.6})`). Omit for a static
   * scene held for its full duration.
   */
  timeline?: string;
  /**
   * Optional voiceover text. Synthesized with kokoro (voice-svc box, default
   * voice em_santa) at render time into a WAV mounted at the scene's start.
   */
  narration?: string;
  /** kokoro voice id (em_santa | em_alex | ef_dora). Defaults to em_santa. */
  narrationVoice?: string;
  /** Public URL of the synthesized narration WAV (set by the server; caches it). */
  narrationUrl?: string;
  /** assets/<name> the render box downloads the narration into. */
  narrationName?: string;
  /** Measured duration (s) of the narration WAV — the scene is stretched to fit it. */
  narrationSec?: number;
}

export interface VideoAssetRef {
  name: string;
  url: string;
  type?: string;
}

interface VideoProjectRow {
  id: string;
  ownerId: string;
  name: string;
  status: string;
  width: number;
  height: number;
  fps: number;
  theme: string;
  customColors: any;
  scenes: any;
  assetRefs: any;
  audioAssetUrl: string | null;
  audioAssetName: string | null;
  lastRenderFileId: string | null;
  lastRenderUrl: string | null;
  lastRenderMs: number | null;
  failReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---- Guards -----------------------------------------------------------------

function throwJson(error: string, status: number): never {
  throw new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function validateObjectId(id: string): void {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) throwJson("Video project not found", 404);
}

async function loadOwned(ctx: AuthContext, id: string): Promise<VideoProjectRow> {
  validateObjectId(id);
  const p = (await db.videoProject.findUnique({ where: { id } })) as VideoProjectRow | null;
  if (!p || p.ownerId !== ctx.user.id) throwJson("Video project not found", 404);
  return p;
}

function scenesOf(p: VideoProjectRow): VideoScene[] {
  return Array.isArray(p.scenes) ? (p.scenes as VideoScene[]) : [];
}

function renumber(scenes: VideoScene[]): VideoScene[] {
  scenes.forEach((s, i) => (s.order = i));
  return scenes;
}

function assetsOf(p: VideoProjectRow): VideoAssetRef[] {
  return Array.isArray(p.assetRefs) ? (p.assetRefs as VideoAssetRef[]) : [];
}

/** Persist scenes with an undo snapshot; returns the fresh scene list. */
async function saveScenes(id: string, previous: VideoScene[], next: VideoScene[]) {
  const previousScenes = JSON.parse(JSON.stringify(previous));
  const result = await db.videoProject.update({
    where: { id },
    data: { scenes: next as any, previousScenes, status: "draft" },
  });
  return result.scenes as unknown as VideoScene[];
}

function summary(p: VideoProjectRow) {
  const scenes = scenesOf(p);
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    width: p.width,
    height: p.height,
    fps: p.fps,
    theme: p.theme,
    sceneCount: scenes.length,
    durationSec: scenes.reduce((a, s) => a + (Number(s.durationSec) || 0), 0),
    hasAudio: !!p.audioAssetUrl,
    lastRenderUrl: p.lastRenderUrl,
    lastRenderFileId: p.lastRenderFileId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ---- CRUD -------------------------------------------------------------------

export async function listVideoProjects(
  ctx: AuthContext,
  opts?: { limit?: number; offset?: number; status?: string }
) {
  requireScope(ctx, "READ");
  const limit = Math.min(opts?.limit ?? 20, 100);
  const offset = opts?.offset ?? 0;
  const where: any = { ownerId: ctx.user.id };
  if (opts?.status) where.status = opts.status;
  const [rows, total] = await Promise.all([
    db.videoProject.findMany({ where, orderBy: { updatedAt: "desc" }, take: limit, skip: offset }),
    db.videoProject.count({ where }),
  ]);
  return { total, items: rows.map((r) => summary(r as VideoProjectRow)) };
}

export async function getVideoProject(ctx: AuthContext, id: string) {
  requireScope(ctx, "READ");
  const p = await loadOwned(ctx, id);
  return {
    ...summary(p),
    customColors: p.customColors,
    audioAssetName: p.audioAssetName,
    assets: assetsOf(p),
    scenes: scenesOf(p),
    lastRenderMs: p.lastRenderMs,
    failReason: p.failReason,
  };
}

export async function createVideoProject(
  ctx: AuthContext,
  opts: {
    name?: string;
    width?: number;
    height?: number;
    fps?: number;
    theme?: string;
    customColors?: any;
    scenes?: Partial<VideoScene>[];
    format?: { preset?: string };
  }
) {
  requireScope(ctx, "WRITE");
  const dims = resolveFormat(opts);
  const scenes = renumber((opts.scenes || []).map((s) => normalizeScene(s)));
  const created = await db.videoProject.create({
    data: {
      ownerId: ctx.user.id,
      name: opts.name?.slice(0, 120) || "Untitled video",
      width: dims.width,
      height: dims.height,
      fps: clampFps(opts.fps) ?? 30,
      theme: opts.theme || "default",
      customColors: opts.customColors ?? undefined,
      scenes: scenes as any,
      status: "draft",
    },
  });
  return summary(created as VideoProjectRow);
}

export async function updateVideoProject(
  ctx: AuthContext,
  id: string,
  patch: {
    name?: string;
    theme?: string;
    customColors?: any;
    fps?: number;
    width?: number;
    height?: number;
  }
) {
  requireScope(ctx, "WRITE");
  await loadOwned(ctx, id);
  const data: any = {};
  if (patch.name !== undefined) data.name = patch.name.slice(0, 120);
  if (patch.theme !== undefined) data.theme = patch.theme;
  if (patch.customColors !== undefined) data.customColors = patch.customColors;
  if (patch.fps !== undefined) data.fps = clampFps(patch.fps) ?? 30;
  if (patch.width !== undefined) data.width = clampDim(patch.width);
  if (patch.height !== undefined) data.height = clampDim(patch.height);
  if (Object.keys(data).length === 0) return getVideoProject(ctx, id);
  const updated = await db.videoProject.update({ where: { id }, data });
  return summary(updated as VideoProjectRow);
}

export async function deleteVideoProject(ctx: AuthContext, id: string) {
  requireScope(ctx, "DELETE");
  await loadOwned(ctx, id);
  await db.videoProject.delete({ where: { id } });
  return { success: true };
}

// ---- Scene ops --------------------------------------------------------------

export async function addScene(
  ctx: AuthContext,
  id: string,
  opts: {
    html: string;
    timeline?: string;
    durationSec?: number;
    label?: string;
    afterIndex?: number;
    narration?: string;
    narrationVoice?: string;
  }
) {
  requireScope(ctx, "WRITE");
  const p = await loadOwned(ctx, id);
  if (!opts.html?.trim()) throwJson("scene html is required", 400);
  const scenes = scenesOf(p);
  const previous = scenes;
  const scene = normalizeScene({
    html: opts.html,
    timeline: opts.timeline,
    durationSec: opts.durationSec,
    label: opts.label || `Scene ${scenes.length + 1}`,
    narration: opts.narration,
    narrationVoice: opts.narrationVoice,
  });
  const at =
    opts.afterIndex !== undefined
      ? Math.max(0, Math.min(opts.afterIndex + 1, scenes.length))
      : scenes.length;
  const next = [...scenes];
  next.splice(at, 0, scene);
  await saveScenes(id, previous, renumber(next));
  return { scene, sceneCount: next.length };
}

export async function setScene(
  ctx: AuthContext,
  id: string,
  sceneId: string,
  patch: {
    html?: string;
    timeline?: string;
    durationSec?: number;
    label?: string;
    narration?: string;
    narrationVoice?: string;
  }
) {
  requireScope(ctx, "WRITE");
  const p = await loadOwned(ctx, id);
  const scenes = scenesOf(p);
  const idx = scenes.findIndex((s) => s.id === sceneId);
  if (idx === -1) throwJson("Scene not found", 404);
  const cur = scenes[idx];
  const nextNarration =
    patch.narration !== undefined ? patch.narration.trim() || undefined : cur.narration;
  const nextVoice =
    patch.narrationVoice !== undefined ? patch.narrationVoice || undefined : cur.narrationVoice;
  // Narration text/voice changed → drop the cached audio so render re-synthesizes.
  const narrationChanged = nextNarration !== cur.narration || nextVoice !== cur.narrationVoice;
  const merged: VideoScene = {
    ...cur,
    html: patch.html !== undefined ? patch.html : cur.html,
    timeline: patch.timeline !== undefined ? patch.timeline || undefined : cur.timeline,
    durationSec:
      patch.durationSec !== undefined ? clampDuration(patch.durationSec) : cur.durationSec,
    label: patch.label !== undefined ? patch.label : cur.label,
    narration: nextNarration,
    narrationVoice: nextVoice,
    narrationUrl: narrationChanged ? undefined : cur.narrationUrl,
    narrationName: narrationChanged ? undefined : cur.narrationName,
    narrationSec: narrationChanged ? undefined : cur.narrationSec,
  };
  // No-op guard — nothing actually changed.
  if (
    merged.html === cur.html &&
    merged.timeline === cur.timeline &&
    merged.durationSec === cur.durationSec &&
    merged.label === cur.label &&
    !narrationChanged
  ) {
    return { scene: cur, changed: false };
  }
  const next = [...scenes];
  next[idx] = merged;
  await saveScenes(id, scenes, next);
  return { scene: merged, changed: true };
}

export async function deleteScene(ctx: AuthContext, id: string, sceneId: string) {
  requireScope(ctx, "WRITE");
  const p = await loadOwned(ctx, id);
  const scenes = scenesOf(p);
  const idx = scenes.findIndex((s) => s.id === sceneId);
  if (idx === -1) throwJson("Scene not found", 404);
  const next = [...scenes];
  next.splice(idx, 1);
  await saveScenes(id, scenes, renumber(next));
  return { success: true, sceneCount: next.length };
}

export async function reorderScenes(ctx: AuthContext, id: string, sceneIds: string[]) {
  requireScope(ctx, "WRITE");
  const p = await loadOwned(ctx, id);
  const scenes = scenesOf(p);
  const existing = new Set(scenes.map((s) => s.id));
  const input = new Set(sceneIds);
  if (
    sceneIds.length !== scenes.length ||
    sceneIds.some((s) => !existing.has(s)) ||
    input.size !== existing.size
  )
    throwJson("sceneIds must contain every existing scene ID exactly once", 400);
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const next = sceneIds.map((sid, i) => ({ ...byId.get(sid)!, order: i }));
  await saveScenes(id, scenes, next);
  return next.map((s) => ({ id: s.id, order: s.order, label: s.label }));
}

// ---- Audio / assets ---------------------------------------------------------

export async function setVideoAudio(
  ctx: AuthContext,
  id: string,
  opts: { url?: string | null; name?: string }
) {
  requireScope(ctx, "WRITE");
  await loadOwned(ctx, id);
  if (!opts.url) {
    const updated = await db.videoProject.update({
      where: { id },
      data: { audioAssetUrl: null, audioAssetName: null },
    });
    return { ...summary(updated as VideoProjectRow), audio: null };
  }
  const name = safeAssetName(opts.name || fileNameFromUrl(opts.url) || "bgm.mp3");
  const updated = await db.videoProject.update({
    where: { id },
    data: { audioAssetUrl: opts.url, audioAssetName: name },
  });
  return { ...summary(updated as VideoProjectRow), audio: { name, url: opts.url } };
}

export async function attachVideoAsset(
  ctx: AuthContext,
  id: string,
  opts: { url: string; name?: string; type?: string }
) {
  requireScope(ctx, "WRITE");
  const p = await loadOwned(ctx, id);
  if (!opts.url?.trim()) throwJson("asset url is required", 400);
  const name = safeAssetName(opts.name || fileNameFromUrl(opts.url) || "asset");
  const assets = assetsOf(p).filter((a) => a.name !== name);
  assets.push({ name, url: opts.url, type: opts.type });
  const updated = await db.videoProject.update({
    where: { id },
    data: { assetRefs: assets as any },
  });
  return { assets: assetsOf(updated as VideoProjectRow), added: { name, url: opts.url } };
}

// ---- Compile + render -------------------------------------------------------

/** Turn a project into a HyperFrames bundle (indexHtml + scenes + assets + audio). */
export function compileVideoProject(p: VideoProjectRow): VideoInput {
  const scenes = scenesOf(p).slice().sort((a, b) => a.order - b.order);
  const w = p.width;
  const h = p.height;
  const fps = p.fps || 30;

  // Effective on-screen duration: at least the authored duration, but stretched
  // to fit the narration WAV (+0.4s tail) so voiceovers never truncate or spill
  // into the next scene.
  const effDur = (s: VideoScene) =>
    Math.max(clampDuration(s.durationSec), s.narrationSec ? s.narrationSec + 0.4 : 0);
  const total = Math.max(1, scenes.reduce((a, s) => a + effDur(s), 0));

  // Sequential slots on one visual track. Narration (per scene) rides a separate
  // audio track, each clip starting at its scene's offset.
  let offset = 0;
  const slots: string[] = [];
  const subComps: { id: string; html: string }[] = [];
  const narrationTags: string[] = [];
  const narrationAssets: { name: string; url: string }[] = [];
  let hasNarration = false;
  for (const s of scenes) {
    const dur = effDur(s);
    const sid = s.id.replace(/[^\w-]/g, "");
    slots.push(
      `      <div data-composition-id="${sid}" data-composition-src="compositions/${sid}.html" data-start="${offset}" data-duration="${dur}" data-track-index="1"></div>`
    );
    subComps.push({ id: sid, html: buildSubComposition(sid, s, dur, w, h) });
    if (s.narrationUrl && s.narrationName) {
      hasNarration = true;
      narrationAssets.push({ name: s.narrationName, url: s.narrationUrl });
      narrationTags.push(
        `      <audio src="assets/${s.narrationName}" data-start="${offset}" data-duration="${dur}" data-track-index="11" data-volume="1"></audio>`
      );
    }
    offset += dur;
  }

  // Duck background music under narration.
  const bgmVol = hasNarration ? 0.22 : 0.7;
  const audioTag = p.audioAssetName
    ? `      <audio id="el-bgm" src="assets/${p.audioAssetName}" data-start="0" data-duration="${total}" data-track-index="10" data-volume="${bgmVol}"></audio>`
    : "";

  const indexHtml = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${w}, height=${h}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${w}px; height: ${h}px; overflow: hidden; background: ${themeBg(p)}; }
      body { font-family: "Inter", system-ui, sans-serif; }
      #root { position: absolute; inset: 0; width: ${w}px; height: ${h}px; overflow: hidden; }
      #bg { position: absolute; inset: 0; background: ${themeBg(p)}; }
      [data-composition-id="root"] > div[data-composition-src] { position: absolute; inset: 0; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="root" data-width="${w}" data-height="${h}" data-fps="${fps}" data-duration="${total}">
      <div id="bg"></div>
${slots.join("\n")}
${audioTag}
${narrationTags.join("\n")}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["root"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>`;

  return {
    indexHtml,
    scenes: subComps,
    assets: [
      ...assetsOf(p).map((a) => ({ name: a.name, url: a.url })),
      ...narrationAssets,
    ],
    audio:
      p.audioAssetUrl && p.audioAssetName
        ? { name: p.audioAssetName, url: p.audioAssetUrl }
        : undefined,
    fps,
    resolution: `${w}x${h}`,
    format: "mp4",
    fileName: p.name,
  };
}

/** One scene → a self-contained sub-composition <template> with its own timeline. */
function buildSubComposition(
  sid: string,
  s: VideoScene,
  dur: number,
  w: number,
  h: number
): string {
  const timeline = (s.timeline || "").trim();
  return `<template>
  <div data-composition-id="${sid}" data-width="${w}" data-height="${h}" data-duration="${dur}" style="position:absolute;inset:0;overflow:hidden;">
    ${s.html}
    <script>
      window.__timelines = window.__timelines || {};
      (function () {
        var tl = gsap.timeline({ paused: true });
        try { ${timeline} } catch (e) { console.error("[scene ${sid}]", e); }
        window.__timelines["${sid}"] = tl;
      })();
    </script>
  </div>
</template>`;
}

/**
 * Synthesize narration (kokoro voice-svc box, default em_santa) for any scene
 * with narration text but no cached audio. Persists narrationUrl/Name so a
 * re-render reuses it. Returns the fresh project row.
 */
export async function ensureNarration(
  ctx: AuthContext,
  p: VideoProjectRow
): Promise<VideoProjectRow> {
  const scenes = scenesOf(p);
  // Re-synth when there's narration text but no cached audio, OR a cached audio
  // without a measured duration (older rows) — we need narrationSec to size scenes.
  const isPending = (s: VideoScene) => !!s.narration && (!s.narrationUrl || s.narrationSec == null);
  if (!scenes.some(isPending)) return p;

  const { synthesizeVoiceFile } = await import("./fleetVoice");
  let changed = false;
  for (const s of scenes) {
    if (!isPending(s)) continue;
    // kokoro loads models lazily → the first request to a cold voice box can 502.
    // Retry with backoff so a cold start doesn't fail the whole render.
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 4000));
      try {
        const r = await synthesizeVoiceFile(ctx, s.narration!, {
          voice: s.narrationVoice,
          format: "wav",
          isPublic: true,
        });
        s.narrationUrl = r.audioUrl;
        s.narrationName = `narr-${s.id}.wav`;
        s.narrationSec = r.durationSec || undefined;
        changed = true;
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e as Error;
      }
    }
    if (lastErr)
      throw new Error(`narration synth failed for scene "${s.label || s.id}": ${lastErr.message}`);
  }
  if (changed) {
    const updated = await db.videoProject.update({
      where: { id: p.id },
      data: { scenes: scenes as any },
    });
    return updated as VideoProjectRow;
  }
  return p;
}

export async function renderVideoProject(ctx: AuthContext, id: string) {
  requireScope(ctx, "WRITE");
  let p = await loadOwned(ctx, id);
  if (scenesOf(p).length === 0) throwJson("Add at least one scene before rendering", 400);

  await db.videoProject.update({ where: { id }, data: { status: "rendering", failReason: null } });
  try {
    p = await ensureNarration(ctx, p);
    const bundle = compileVideoProject(p);
    const result = await renderViaHyperframesBox(ctx, bundle);
    const updated = await db.videoProject.update({
      where: { id },
      data: {
        status: "ready",
        lastRenderFileId: result.fileId,
        lastRenderUrl: result.url,
        lastRenderMs: result.renderMs ?? null,
        failReason: null,
      },
    });
    return { ...summary(updated as VideoProjectRow), file: result };
  } catch (e: any) {
    await db.videoProject
      .update({ where: { id }, data: { status: "failed", failReason: e?.message?.slice(0, 300) } })
      .catch(() => {});
    throw e;
  }
}

// ---- Small helpers ----------------------------------------------------------

function normalizeScene(s: Partial<VideoScene>): VideoScene {
  const narration = s.narration?.trim() || undefined;
  // If no explicit duration but there's narration, estimate so the voiceover fits
  // (~14 chars/sec Spanish TTS + 0.8s tail). Agent-set durations always win.
  const duration =
    s.durationSec == null && narration
      ? clampDuration(narration.length / 14 + 0.8)
      : clampDuration(s.durationSec);
  return {
    id: s.id && /^[\w-]+$/.test(s.id) ? s.id : crypto.randomUUID(),
    order: s.order ?? 0,
    label: s.label,
    durationSec: duration,
    html: String(s.html || ""),
    timeline: s.timeline ? String(s.timeline) : undefined,
    narration,
    narrationVoice: s.narrationVoice || undefined,
    narrationUrl: s.narrationUrl || undefined,
    narrationName: s.narrationName || undefined,
    narrationSec: s.narrationSec || undefined,
  };
}

/** Rough seconds a kokoro voiceover of `text` will run (Spanish, ~14 cps + tail). */
function estimateNarrationSec(text: string): number {
  return clampDuration(text.trim().length / 14 + 0.8);
}

function clampDuration(d: any): number {
  const n = Number(d);
  if (!isFinite(n) || n <= 0) return 3;
  return Math.min(Math.max(n, 0.3), 120);
}

function clampFps(f: any): number | undefined {
  const n = Number(f);
  if (!isFinite(n)) return undefined;
  return Math.min(Math.max(Math.round(n), 1), 60);
}

function clampDim(d: any): number {
  const n = Math.round(Number(d));
  if (!isFinite(n)) return 1080;
  return Math.min(Math.max(n, 100), 4096);
}

function resolveFormat(opts: {
  width?: number;
  height?: number;
  format?: { preset?: string };
}): { width: number; height: number } {
  const presets: Record<string, [number, number]> = {
    portrait: [1080, 1920],
    story: [1080, 1920],
    reel: [1080, 1920],
    tiktok: [1080, 1920],
    square: [1080, 1080],
    landscape: [1920, 1080],
    "16-9": [1920, 1080],
    youtube: [1920, 1080],
  };
  const preset = opts.format?.preset ? presets[opts.format.preset] : undefined;
  if (preset) return { width: preset[0], height: preset[1] };
  return { width: clampDim(opts.width ?? 1080), height: clampDim(opts.height ?? 1920) };
}

function themeBg(p: VideoProjectRow): string {
  const cc = (p.customColors || {}) as any;
  if (cc.background) return String(cc.background);
  const primary = cc.primary ? String(cc.primary) : "#6d28d9";
  switch (p.theme) {
    case "light":
      return `radial-gradient(circle at 50% 32%, #ffffff 0%, #eef0f6 55%, #dfe3ee 100%)`;
    case "brand":
      return `radial-gradient(circle at 50% 32%, ${primary} 0%, #1a0b3a 42%, #07060c 78%)`;
    case "dark":
    case "default":
    default:
      return `radial-gradient(circle at 50% 32%, #6d28d9 0%, #1a0b3a 42%, #07060c 78%)`;
  }
}

function safeAssetName(name: string): string {
  const base = name.split(/[\\/]/).pop() || "asset";
  const cleaned = base.replace(/[^\w.\-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "asset";
}

function fileNameFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last || undefined;
  } catch {
    return undefined;
  }
}
