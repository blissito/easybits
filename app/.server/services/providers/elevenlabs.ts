/**
 * ElevenLabs TTS adapter — text-to-speech with high-quality voices,
 * including custom-cloned voices. Returns an mp3 File ready to feed into
 * `video.fal.avatar` (talking-head pipeline).
 *
 * API: https://elevenlabs.io/docs/api-reference
 *   POST /v1/text-to-speech/{voiceId}
 *     body: { text, model_id, voice_settings? }
 *     headers: xi-api-key, Accept: audio/mpeg
 *     returns: binary mp3
 *
 * Default voice: configurable via `ELEVENLABS_DEFAULT_VOICE` env. Falls back
 * to a stock Spanish voice id (Sarah-style) — caller can always override per
 * request via `voiceId`.
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

const ELEVENLABS_API_URL = "https://api.elevenlabs.io";

/** Stock Spanish-friendly voice id used when caller doesn't pass one. */
const FALLBACK_VOICE_ID = process.env.ELEVENLABS_DEFAULT_VOICE || "EXAVITQu4vr4xnSDxMaL";

/** Default model — eleven_multilingual_v2 supports Spanish + voice cloning. */
const DEFAULT_MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";

/** Cost: 1 crédito per 100 characters. 1 min TTS ≈ 800 chars ≈ 8 créditos. */
export const TARIFF_ELEVENLABS_CHARS_PER_CREDIT = 100;

export interface ElevenLabsTtsInput {
  /** Text to synthesize. Required. Max ~5000 chars per call. */
  text: string;
  /** ElevenLabs voice id. Defaults to ELEVENLABS_DEFAULT_VOICE env. */
  voiceId?: string;
  /** Model id. Default eleven_multilingual_v2. */
  modelId?: string;
  /** 0..1 — higher = more consistent, lower = more variation. */
  stability?: number;
  /** 0..1 — similarity to the original/cloned voice. */
  similarityBoost?: number;
  /** Whether to make the resulting mp3 File public (CDN). Default true (so it can be passed to avatar). */
  isPublic?: boolean;
}

export interface ElevenLabsTtsOutput extends ServiceResult {
  data: {
    fileId: string;
    /** Public URL of the mp3 — pass directly to `avatar_video_create.audioUrl`. */
    audioUrl: string | null;
    voiceId: string;
    modelId: string;
    chars: number;
  };
}

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new ServiceConfigError("voice.elevenlabs.tts", "ELEVENLABS_API_KEY");
  return key;
}

async function uploadMp3(
  userId: string,
  buffer: Buffer,
  isPublic: boolean,
): Promise<{ fileId: string; publicUrl: string | null }> {
  const filename = `tts-${nanoid(6)}.mp3`;
  const storageKey = `${userId}/${filename}`;

  if (isPublic) {
    const client = getPlatformPublicClient();
    const putUrl = await client.getPutUrl(storageKey, { timeout: 120 });
    const putRes = await fetch(putUrl, {
      method: "PUT",
      body: new Uint8Array(buffer),
      headers: { "Content-Type": "audio/mpeg" },
    });
    if (!putRes.ok) {
      throw new ServiceProviderError(
        "voice.elevenlabs.tts",
        putRes.status,
        "upload: Tigris public put failed",
      );
    }
    const publicUrl = buildPublicAssetUrl(storageKey);
    const file = await db.file.create({
      data: {
        name: filename,
        storageKey,
        slug: storageKey,
        size: buffer.length,
        contentType: "audio/mpeg",
        ownerId: userId,
        access: "public",
        url: publicUrl,
        status: "DONE",
        source: "elevenlabs",
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
    headers: { "Content-Type": "audio/mpeg" },
  });
  if (!putRes.ok) {
    throw new ServiceProviderError(
      "voice.elevenlabs.tts",
      putRes.status,
      "upload: Tigris private put failed",
    );
  }
  const file = await db.file.create({
    data: {
      name: filename,
      storageKey,
      slug: storageKey,
      size: buffer.length,
      contentType: "audio/mpeg",
      ownerId: userId,
      access: "private",
      url: "",
      status: "DONE",
      storageProviderId: provider?.id ?? null,
      source: "elevenlabs",
    },
  });
  return { fileId: file.id, publicUrl: null };
}

export const elevenLabsTtsService: ServiceDef<ElevenLabsTtsInput, ElevenLabsTtsOutput> = {
  id: "voice.elevenlabs.tts",
  product: "voice",
  displayName: "Voz TTS (ElevenLabs)",
  description:
    "Convierte texto en mp3 con voces de alta calidad (incluye voces clonadas). Lista para alimentar avatar_video_create.",
  estimateCost(input) {
    const chars = (input.text ?? "").length;
    return Math.max(1, Math.ceil(chars / TARIFF_ELEVENLABS_CHARS_PER_CREDIT));
  },
  async execute(input, ctx: ServiceCtx) {
    const apiKey = getApiKey();
    const text = input.text?.trim();
    if (!text) {
      throw new ServiceProviderError("voice.elevenlabs.tts", 400, "text is required");
    }
    const voiceId = input.voiceId || FALLBACK_VOICE_ID;
    const modelId = input.modelId || DEFAULT_MODEL;

    const body: Record<string, unknown> = {
      text,
      model_id: modelId,
    };
    if (input.stability !== undefined || input.similarityBoost !== undefined) {
      body.voice_settings = {
        stability: input.stability ?? 0.5,
        similarity_boost: input.similarityBoost ?? 0.75,
      };
    }

    const res = await fetch(
      `${ELEVENLABS_API_URL}/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new ServiceProviderError(
        "voice.elevenlabs.tts",
        res.status,
        `TTS failed: ${errText.slice(0, 300)}`,
      );
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) {
      throw new ServiceProviderError(
        "voice.elevenlabs.tts",
        res.status,
        "TTS returned empty audio",
      );
    }

    // Default isPublic=true so the resulting URL can be passed to avatar service.
    const { fileId, publicUrl } = await uploadMp3(
      ctx.userId,
      buffer,
      input.isPublic ?? true,
    );

    return {
      modelId,
      data: {
        fileId,
        audioUrl: publicUrl,
        voiceId,
        modelId,
        chars: text.length,
      },
    };
  },
};
