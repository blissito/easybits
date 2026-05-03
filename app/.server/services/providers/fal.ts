/**
 * fal.ai adapter — pay-per-use access to open-source models hosted on fal.
 *
 * No subscription. Single API key (`FAL_KEY`). Uniform queue API across all
 * models, so future services (image generation, video gen, etc.) reuse the
 * same `falQueue()` helper below.
 *
 * Active service: `video.fal.avatar` — talking-head from single image + audio.
 * Default model: `fal-ai/sadtalker` (battle-tested OSS model, single image +
 * audio → mp4). Override via `FAL_AVATAR_MODEL` env var to swap to Hallo2,
 * LivePortrait, or any future fal-hosted model with `image + audio → video`
 * shape.
 *
 * Reference: https://fal.ai/models — endpoints follow `queue.fal.run/<id>`
 * with `Authorization: Key <FAL_KEY>` header.
 */
import { db } from "../../db";
import { nanoid } from "nanoid";
import {
  buildPublicAssetUrl,
  createStorageClient,
  getPlatformDefaultClient,
  getPlatformPublicClient,
  resolveProvider,
} from "../../storage";
import { ServiceConfigError, ServiceProviderError } from "../errors";
import type { ServiceCtx, ServiceDef, ServiceResult } from "../types";

const FAL_QUEUE_URL = process.env.FAL_QUEUE_URL || "https://queue.fal.run";
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 6 * 60 * 1000; // 6 min — OSS models can be slower than commercial

/** Default talking-head model. Override via FAL_AVATAR_MODEL env. */
const DEFAULT_AVATAR_MODEL = process.env.FAL_AVATAR_MODEL || "fal-ai/sadtalker";

/** Cost per second of generated video, in créditos. 30s reel ≈ 6 créditos at this rate. */
export const TARIFF_FAL_AVATAR_PER_SECOND = 0.2;

export interface FalAvatarInput {
  /** HTTPS URL of portrait image (face, ideally clean background). */
  imageUrl: string;
  /** Audio URL (mp3/wav) — REQUIRED. fal models for avatar take pre-recorded audio.
   *  TTS upstream (ElevenLabs etc.) happens in a separate service, not here. */
  audioUrl: string;
  /** Output duration hint, used for cost estimate only. fal infers from audio length. */
  durationSec?: number;
  /** Aspect ratio post-process (the model itself outputs square or matches portrait). */
  ratio?: "9:16" | "16:9" | "1:1";
  /** Whether to make the resulting File public (CDN-accessible). Default false. */
  isPublic?: boolean;
}

export interface FalAvatarOutput extends ServiceResult {
  data: {
    fileId: string;
    videoUrl: string | null; // public URL if isPublic, else null
    durationSec: number;
    modelId: string;
  };
}

function getApiKey(): string {
  const key = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!key) throw new ServiceConfigError("video.fal.avatar", "FAL_KEY");
  return key;
}

/**
 * Generic fal.ai queue helper. Submit a job, poll until done, return result.
 * Reusable for any future fal model (image, video, audio).
 */
async function falQueue<T>(modelId: string, payload: unknown): Promise<T> {
  const apiKey = getApiKey();
  const submitRes = await fetch(`${FAL_QUEUE_URL}/${modelId}`, {
    method: "POST",
    headers: {
      "Authorization": `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const submitText = await submitRes.text();
  if (!submitRes.ok) {
    throw new ServiceProviderError("fal", submitRes.status, `submit: ${submitText}`);
  }
  const submitData = JSON.parse(submitText) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
  };
  if (!submitData.request_id || !submitData.status_url) {
    throw new ServiceProviderError("fal", submitRes.status, "submit: missing request_id or status_url");
  }

  // Poll status
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const statusRes = await fetch(submitData.status_url, {
      headers: { "Authorization": `Key ${apiKey}` },
    });
    const statusText = await statusRes.text();
    if (!statusRes.ok) {
      throw new ServiceProviderError("fal", statusRes.status, `status: ${statusText}`);
    }
    const statusData = JSON.parse(statusText) as { status?: string; logs?: unknown };
    const status = statusData.status?.toUpperCase();
    if (status === "COMPLETED" || status === "OK" || status === "SUCCEEDED") {
      // Fetch response
      const responseUrl = submitData.response_url ?? `${FAL_QUEUE_URL}/${modelId}/requests/${submitData.request_id}`;
      const respRes = await fetch(responseUrl, {
        headers: { "Authorization": `Key ${apiKey}` },
      });
      const respText = await respRes.text();
      if (!respRes.ok) {
        throw new ServiceProviderError("fal", respRes.status, `response: ${respText}`);
      }
      return JSON.parse(respText) as T;
    }
    if (status === "FAILED" || status === "ERROR") {
      throw new ServiceProviderError("fal", statusRes.status, `job failed: ${statusText}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new ServiceProviderError("fal", null, `poll timeout after ${POLL_TIMEOUT_MS}ms`);
}

/**
 * Most fal models return a video output as one of:
 *   { video: { url } }            — newer models
 *   { video_url: "..." }          — some older models
 *   { output: { url } }           — generic
 * Try each shape so we don't have to special-case per model.
 */
function extractVideoUrl(resp: unknown): string | null {
  const r = resp as Record<string, any>;
  return (
    r?.video?.url ??
    r?.video_url ??
    r?.output?.url ??
    r?.output_url ??
    null
  );
}

async function downloadToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new ServiceProviderError("video.fal.avatar", res.status, `download: ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function uploadMp4(
  userId: string,
  buffer: Buffer,
  isPublic: boolean,
): Promise<{ fileId: string; publicUrl: string | null }> {
  const filename = `fal-avatar-${nanoid(6)}.mp4`;
  const storageKey = `${userId}/${filename}`;

  if (isPublic) {
    const client = getPlatformPublicClient();
    const putUrl = await client.getPutUrl(storageKey, { timeout: 180 });
    const putRes = await fetch(putUrl, {
      method: "PUT",
      body: new Uint8Array(buffer),
      headers: { "Content-Type": "video/mp4" },
    });
    if (!putRes.ok) {
      throw new ServiceProviderError("video.fal.avatar", putRes.status, "upload: Tigris public put failed");
    }
    const publicUrl = buildPublicAssetUrl(storageKey);
    const file = await db.file.create({
      data: {
        name: filename,
        storageKey,
        slug: storageKey,
        size: buffer.length,
        contentType: "video/mp4",
        ownerId: userId,
        access: "public",
        url: publicUrl,
        status: "DONE",
        source: "fal",
      },
    });
    return { fileId: file.id, publicUrl };
  }

  const provider = await resolveProvider(userId);
  const client = provider ? createStorageClient(provider) : getPlatformDefaultClient();
  const putUrl = await client.getPutUrl(storageKey, { timeout: 180 });
  const putRes = await fetch(putUrl, {
    method: "PUT",
    body: new Uint8Array(buffer),
    headers: { "Content-Type": "video/mp4" },
  });
  if (!putRes.ok) {
    throw new ServiceProviderError("video.fal.avatar", putRes.status, "upload: Tigris private put failed");
  }
  const file = await db.file.create({
    data: {
      name: filename,
      storageKey,
      slug: storageKey,
      size: buffer.length,
      contentType: "video/mp4",
      ownerId: userId,
      access: "private",
      url: "",
      status: "DONE",
      storageProviderId: provider?.id ?? null,
      source: "fal",
    },
  });
  return { fileId: file.id, publicUrl: null };
}

/* ────────────────────────────────────────────────────────────────────── */
/* IMAGE GENERATION — fal.ai Flux models                                  */
/* ────────────────────────────────────────────────────────────────────── */

const DEFAULT_IMAGE_MODEL = process.env.FAL_IMAGE_MODEL || "fal-ai/flux/schnell";

export interface FalImageInput {
  prompt: string;
  /** Quality tier: "fast" (schnell, 1 crédito) or "premium" (flux/dev, 3 créditos). Default fast. */
  quality?: "fast" | "premium";
  /** Image aspect ratio. Default "1:1". */
  ratio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  /** Negative prompt — what to avoid. */
  negative?: string;
  /** Seed for reproducibility. */
  seed?: number;
  /** Default true (so the URL is reusable as referenceImage in avatar/video). */
  isPublic?: boolean;
}

export interface FalImageOutput extends ServiceResult {
  data: {
    fileId: string;
    imageUrl: string | null; // public URL if isPublic, else null
    width: number;
    height: number;
    modelId: string;
  };
}

function ratioToSize(ratio: string): { width: number; height: number } {
  switch (ratio) {
    case "16:9": return { width: 1344, height: 768 };
    case "9:16": return { width: 768, height: 1344 };
    case "4:3": return { width: 1152, height: 896 };
    case "3:4": return { width: 896, height: 1152 };
    case "1:1":
    default: return { width: 1024, height: 1024 };
  }
}

async function uploadImage(
  userId: string,
  buffer: Buffer,
  contentType: string,
  isPublic: boolean,
): Promise<{ fileId: string; publicUrl: string | null }> {
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const filename = `fal-image-${nanoid(6)}.${ext}`;
  const storageKey = `${userId}/${filename}`;

  if (isPublic) {
    const client = getPlatformPublicClient();
    const putUrl = await client.getPutUrl(storageKey, { timeout: 120 });
    const putRes = await fetch(putUrl, {
      method: "PUT",
      body: new Uint8Array(buffer),
      headers: { "Content-Type": contentType },
    });
    if (!putRes.ok) {
      throw new ServiceProviderError("image.fal.generate", putRes.status, "upload: Tigris public put failed");
    }
    const publicUrl = buildPublicAssetUrl(storageKey);
    const file = await db.file.create({
      data: {
        name: filename,
        storageKey,
        slug: storageKey,
        size: buffer.length,
        contentType,
        ownerId: userId,
        access: "public",
        url: publicUrl,
        status: "DONE",
        source: "fal",
      },
    });
    return { fileId: file.id, publicUrl };
  }

  const provider = await resolveProvider(userId);
  const client = provider ? createStorageClient(provider) : getPlatformDefaultClient();
  const putUrl = await client.getPutUrl(storageKey, { timeout: 120 });
  const putRes = await fetch(putUrl, {
    method: "PUT",
    body: new Uint8Array(buffer),
    headers: { "Content-Type": contentType },
  });
  if (!putRes.ok) {
    throw new ServiceProviderError("image.fal.generate", putRes.status, "upload: Tigris private put failed");
  }
  const file = await db.file.create({
    data: {
      name: filename,
      storageKey,
      slug: storageKey,
      size: buffer.length,
      contentType,
      ownerId: userId,
      access: "private",
      url: "",
      status: "DONE",
      storageProviderId: provider?.id ?? null,
      source: "fal",
    },
  });
  return { fileId: file.id, publicUrl: null };
}

export const falImageService: ServiceDef<FalImageInput, FalImageOutput> = {
  id: "image.fal.generate",
  product: "image",
  displayName: "Image Generation (fal.ai Flux)",
  description:
    "Genera una imagen desde prompt usando Flux Schnell (rápido) o Flux Dev (premium). Output mp4-ready para alimentar avatar/video.",
  estimateCost(input) {
    return input.quality === "premium" ? 3 : 1;
  },
  async execute(input, ctx: ServiceCtx) {
    const prompt = input.prompt?.trim();
    if (!prompt) {
      throw new ServiceProviderError("image.fal.generate", 400, "prompt is required");
    }
    const quality = input.quality ?? "fast";
    const modelId = quality === "premium" ? "fal-ai/flux/dev" : DEFAULT_IMAGE_MODEL;
    const { width, height } = ratioToSize(input.ratio ?? "1:1");

    const payload: Record<string, unknown> = {
      prompt,
      image_size: { width, height },
      num_inference_steps: quality === "premium" ? 28 : 4,
      enable_safety_checker: true,
    };
    if (input.negative) payload.negative_prompt = input.negative;
    if (typeof input.seed === "number") payload.seed = input.seed;

    const resp = (await falQueue<unknown>(modelId, payload)) as Record<string, any>;
    const imageUrl: string | null =
      resp?.images?.[0]?.url ?? resp?.image?.url ?? resp?.url ?? null;
    if (!imageUrl) {
      throw new ServiceProviderError(
        "image.fal.generate",
        null,
        `model returned no image URL. response: ${JSON.stringify(resp).slice(0, 300)}`,
      );
    }

    const dlRes = await fetch(imageUrl);
    if (!dlRes.ok) {
      throw new ServiceProviderError("image.fal.generate", dlRes.status, "download failed");
    }
    const contentType = dlRes.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await dlRes.arrayBuffer());
    const { fileId, publicUrl } = await uploadImage(
      ctx.userId,
      buffer,
      contentType,
      input.isPublic ?? true,
    );

    return {
      modelId,
      data: {
        fileId,
        imageUrl: publicUrl,
        width,
        height,
        modelId,
      },
    };
  },
};

export const falAvatarService: ServiceDef<FalAvatarInput, FalAvatarOutput> = {
  id: "video.fal.avatar",
  product: "avatar",
  displayName: "Avatar Video (fal.ai)",
  description:
    "Genera video talking-head desde foto + audio usando modelos OSS hosteados en fal.ai (SadTalker, Hallo2, LivePortrait — configurable).",
  estimateCost(input) {
    const dur = Math.min(60, Math.max(2, input.durationSec ?? 30));
    return Math.ceil(dur * TARIFF_FAL_AVATAR_PER_SECOND);
  },
  async execute(input, ctx: ServiceCtx) {
    const modelId = DEFAULT_AVATAR_MODEL;
    // Most fal talking-head models accept these field names — sadtalker uses
    // `source_image_url` + `driven_audio_url`; livePortrait uses `image_url` +
    // `audio_url`; we send both naming styles to be model-agnostic. Extra
    // fields are ignored by fal.
    const payload = {
      source_image_url: input.imageUrl,
      driven_audio_url: input.audioUrl,
      image_url: input.imageUrl,
      audio_url: input.audioUrl,
    };
    const resp = await falQueue<unknown>(modelId, payload);
    const videoUrl = extractVideoUrl(resp);
    if (!videoUrl) {
      throw new ServiceProviderError(
        "video.fal.avatar",
        null,
        `model returned no video URL. response: ${JSON.stringify(resp).slice(0, 300)}`,
      );
    }
    const buffer = await downloadToBuffer(videoUrl);
    const { fileId, publicUrl } = await uploadMp4(
      ctx.userId,
      buffer,
      input.isPublic ?? false,
    );
    return {
      modelId,
      data: {
        fileId,
        videoUrl: publicUrl,
        durationSec: input.durationSec ?? 30,
        modelId,
      },
    };
  },
};
