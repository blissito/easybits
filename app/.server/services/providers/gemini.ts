/**
 * Gemini "Nano Banana 2" adapter — image edit + generation via Google's
 * `gemini-3-pro-image-preview` (a.k.a. Nano Banana Pro).
 *
 * Single tool, two modes:
 *   - edit:     prompt + reference image(s) → edited/composed image
 *   - generate: prompt only → image from scratch (fallback when no reference)
 *
 * Uses the PLATFORM key (`GOOGLE_GENERATIVE_AI_API_KEY`) so users never pass
 * their own — the cost is billed in créditos by the orchestrator (consume.ts).
 *
 * Resolution defaults to 2K (override via `NANO_BANANA_SIZE`). At 2K the
 * upstream cost is ~$0.134/image, charged as `COST_DOC` (1 generación).
 */
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { nanoid } from "nanoid";
import { db } from "../../db";
import {
  buildPublicAssetUrl,
  createStorageClient,
  getPlatformDefaultClient,
  getPlatformPublicClient,
  resolveProvider,
} from "../../storage";
import { ServiceConfigError, ServiceProviderError } from "../errors";
import type { ServiceCtx, ServiceDef, ServiceResult } from "../types";
import { COST_DOC } from "~/lib/credits";

const MODEL_ID = process.env.NANO_BANANA_MODEL || "gemini-3-pro-image-preview";
const DEFAULT_IMAGE_SIZE =
  (process.env.NANO_BANANA_SIZE as "1K" | "2K" | "4K" | "512") || "2K";

export type NanoBananaAspectRatio =
  | "1:1" | "2:3" | "3:2" | "3:4" | "4:3"
  | "4:5" | "5:4" | "9:16" | "16:9" | "21:9";

export interface GeminiEditImageInput {
  prompt: string;
  /** Reference image(s) to edit/compose. Omit → pure text-to-image generation. */
  images?: Array<{ data: Uint8Array; mediaType: string }>;
  aspectRatio?: NanoBananaAspectRatio;
  /** Default true (so the URL is reusable as referenceImage in avatar/video). */
  isPublic?: boolean;
  name?: string;
}

export interface GeminiEditImageOutput extends ServiceResult {
  data: {
    fileId: string;
    imageUrl: string | null; // public URL if isPublic, else null
    mediaType: string;
    modelId: string;
    mode: "edit" | "generate";
  };
}

function getApiKey(): string {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new ServiceConfigError("image.gemini.edit", "GOOGLE_GENERATIVE_AI_API_KEY");
  return key;
}

function extFor(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  return "png";
}

async function uploadImage(
  userId: string,
  buffer: Buffer,
  contentType: string,
  isPublic: boolean,
  name?: string,
): Promise<{ fileId: string; publicUrl: string | null }> {
  const ext = extFor(contentType);
  const base = (name || `nano-banana-${nanoid(6)}`)
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase() || `nano-banana-${nanoid(6)}`;
  const filename = `${base}.${ext}`;
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
      throw new ServiceProviderError("image.gemini.edit", putRes.status, "upload: Tigris public put failed");
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
        source: "gemini",
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
    throw new ServiceProviderError("image.gemini.edit", putRes.status, "upload: Tigris private put failed");
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
      source: "gemini",
    },
  });
  return { fileId: file.id, publicUrl: null };
}

export const geminiEditImageService: ServiceDef<GeminiEditImageInput, GeminiEditImageOutput> = {
  id: "image.gemini.edit",
  product: "image",
  displayName: "Image Edit/Generate (Gemini Nano Banana 2)",
  description:
    "Edita o compone imágenes desde referencia(s) + prompt usando gemini-3-pro-image-preview (Nano Banana Pro). Sin referencia genera desde texto.",
  estimateCost() {
    // 2K Nano Banana Pro cuesta ~$2.40 MXN/imagen — casi una generación de doc.
    // Cobramos 2 generaciones para mantener margen sano en todos los packs.
    return COST_DOC * 2;
  },
  async execute(input, ctx: ServiceCtx) {
    const prompt = input.prompt?.trim();
    if (!prompt) {
      throw new ServiceProviderError("image.gemini.edit", 400, "prompt is required");
    }
    const google = createGoogleGenerativeAI({ apiKey: getApiKey() });
    const hasRefs = (input.images?.length ?? 0) > 0;

    const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
    for (const img of input.images ?? []) {
      content.push({ type: "image", image: img.data, mediaType: img.mediaType });
    }

    const imageConfig: {
      imageSize: "1K" | "2K" | "4K" | "512";
      aspectRatio?: NanoBananaAspectRatio;
    } = { imageSize: DEFAULT_IMAGE_SIZE };
    if (input.aspectRatio) imageConfig.aspectRatio = input.aspectRatio;

    let result: Awaited<ReturnType<typeof generateText>>;
    try {
      result = await generateText({
        model: google(MODEL_ID),
        providerOptions: {
          google: { responseModalities: ["TEXT", "IMAGE"], imageConfig },
        },
        messages: [{ role: "user", content: content as never }],
      });
    } catch (e: any) {
      throw new ServiceProviderError(
        "image.gemini.edit",
        e?.statusCode ?? e?.status ?? null,
        e?.message || "Gemini image call failed",
      );
    }

    const imageFile = result.files?.find((f) => f.mediaType?.startsWith("image/"));
    if (!imageFile) {
      throw new ServiceProviderError(
        "image.gemini.edit",
        null,
        `model returned no image. text: ${(result.text || "").slice(0, 200)}`,
      );
    }
    const buffer = Buffer.from(imageFile.uint8Array);
    const mediaType = imageFile.mediaType || "image/png";
    const { fileId, publicUrl } = await uploadImage(
      ctx.userId,
      buffer,
      mediaType,
      input.isPublic ?? true,
      input.name,
    );

    return {
      modelId: MODEL_ID,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      data: {
        fileId,
        imageUrl: publicUrl,
        mediaType,
        modelId: MODEL_ID,
        mode: hasRefs ? "edit" : "generate",
      },
    };
  },
};
