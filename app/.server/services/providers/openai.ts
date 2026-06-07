/**
 * OpenAI gpt-image-2 adapter — image generation + reference-based editing.
 *
 * Single tool, two modes (mirror of gemini.ts):
 *   - generate: prompt only        → POST /v1/images/generations (JSON)
 *   - edit:     prompt + image(s)   → POST /v1/images/edits (multipart, image[])
 *
 * Uses the PLATFORM key (`OPENAI_API_KEY`); cost is billed in créditos by the
 * orchestrator (consume.ts). Default model gpt-image-2; caller may request
 * gpt-image-1 via `model`. Results are stored PUBLIC so the URL is reusable.
 */
import { nanoid } from "nanoid";
import { db } from "../../db";
import { buildPublicAssetUrl, getPlatformPublicClient } from "../../storage";
import { ServiceConfigError, ServiceProviderError } from "../errors";
import type { ServiceCtx, ServiceDef, ServiceResult } from "../types";
import { COST_DOC } from "~/lib/credits";

const DEFAULT_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

export interface OpenaiImageInput {
  prompt: string;
  model?: "gpt-image-2" | "gpt-image-1";
  /** Reference image(s) to edit/compose. Omit → text-to-image generation. */
  images?: Array<{ data: Uint8Array; mediaType: string }>;
  mask?: { data: Uint8Array; mediaType: string };
  size?: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
  quality?: "low" | "medium" | "high" | "auto";
  n?: number;
  name?: string;
}

export interface OpenaiImageOutput extends ServiceResult {
  data: {
    fileId: string;
    imageUrl: string;
    mode: "edit" | "generate";
    modelId: string;
    images: Array<{ fileId: string; imageUrl: string }>;
  };
}

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new ServiceConfigError("image.openai.generate", "OPENAI_API_KEY");
  return key;
}

/**
 * Find a storageKey that doesn't collide with an existing File record.
 * Reusing the same `name` would otherwise hit the File_storageKey_key unique
 * constraint and bubble up as a raw 500. We auto-suffix (-1, -2, …) instead.
 */
async function resolveUniqueStorageKey(userId: string, base: string): Promise<string> {
  for (let n = 0; n < 50; n++) {
    const suffix = n === 0 ? "" : `-${n}`;
    const key = `${userId}/${base}${suffix}.png`;
    const existing = await db.file.findUnique({ where: { storageKey: key }, select: { id: true } });
    if (!existing) return key;
  }
  // Pathological: 50 collisions. Fall back to a guaranteed-unique random key.
  return `${userId}/${base}-${nanoid(6)}.png`;
}

async function uploadPublicPng(
  userId: string,
  buffer: Buffer,
  name?: string,
): Promise<{ fileId: string; imageUrl: string }> {
  const base =
    (name || `gpt-image-${nanoid(6)}`)
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || `gpt-image-${nanoid(6)}`;
  const client = getPlatformPublicClient();

  // Up to 2 attempts: the pre-check loop handles the common case; the catch
  // handles a TOCTOU race (two parallel creates picking the same key).
  let storageKey = await resolveUniqueStorageKey(userId, base);
  for (let attempt = 0; attempt < 2; attempt++) {
    const putUrl = await client.getPutUrl(storageKey, { timeout: 120 });
    const putRes = await fetch(putUrl, {
      method: "PUT",
      body: new Uint8Array(buffer),
      headers: { "Content-Type": "image/png" },
    });
    if (!putRes.ok) {
      throw new ServiceProviderError("image.openai.generate", putRes.status, "upload: Tigris public put failed");
    }
    const imageUrl = buildPublicAssetUrl(storageKey);
    try {
      const file = await db.file.create({
        data: {
          name: `${base}.png`,
          storageKey,
          slug: storageKey,
          size: buffer.length,
          contentType: "image/png",
          ownerId: userId,
          access: "public",
          url: imageUrl,
          status: "DONE",
          source: "openai",
        },
      });
      return { fileId: file.id, imageUrl };
    } catch (e: any) {
      if (e?.code === "P2002" && attempt === 0) {
        // Lost a race on the key — pick a random one and retry once.
        storageKey = `${userId}/${base}-${nanoid(6)}.png`;
        continue;
      }
      throw new ServiceProviderError("image.openai.generate", null, `save failed: ${e?.message || "db.file.create"}`);
    }
  }
  // Unreachable, but keeps the type checker happy.
  throw new ServiceProviderError("image.openai.generate", null, "save failed: exhausted retries");
}

export const openaiImageService: ServiceDef<OpenaiImageInput, OpenaiImageOutput> = {
  id: "image.openai.generate",
  product: "image",
  displayName: "Image Generate/Edit (OpenAI gpt-image-2)",
  description:
    "Genera o edita imágenes con gpt-image-2. Con imagen(es) de referencia EDITA (fiel a la composición); sin referencia genera desde el prompt.",
  estimateCost(input) {
    const q = input.quality || "low";
    const perImage = q === "high" ? 3 : q === "medium" ? 2 : 1;
    const editSurcharge = (input.images?.length ?? 0) > 0 ? 1 : 0;
    return COST_DOC * (perImage + editSurcharge) * Math.max(1, input.n ?? 1);
  },
  async execute(input, ctx: ServiceCtx) {
    const prompt = input.prompt?.trim();
    if (!prompt) throw new ServiceProviderError("image.openai.generate", 400, "prompt is required");

    const key = getApiKey();
    const model = input.model || DEFAULT_MODEL;
    const size = input.size || "1024x1024";
    const quality = input.quality || "low";
    const hasRefs = (input.images?.length ?? 0) > 0;

    let res: Response;
    try {
      if (hasRefs) {
        const fd = new FormData();
        fd.set("model", model);
        fd.set("prompt", prompt);
        if (size !== "auto") fd.set("size", size);
        if (quality !== "auto") fd.set("quality", quality);
        fd.set("output_format", "png");
        input.images!.forEach((img, i) => {
          fd.append("image[]", new Blob([img.data as BlobPart], { type: img.mediaType || "image/png" }), `ref${i}.png`);
        });
        if (input.mask) {
          fd.set("mask", new Blob([input.mask.data as BlobPart], { type: input.mask.mediaType || "image/png" }), "mask.png");
        }
        res = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: fd,
        });
      } else {
        const body: Record<string, unknown> = { model, prompt, n: Math.max(1, input.n ?? 1) };
        if (size !== "auto") body.size = size;
        if (quality !== "auto") body.quality = quality;
        res = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify(body),
        });
      }
    } catch (e: any) {
      throw new ServiceProviderError("image.openai.generate", null, e?.message || "OpenAI image call failed");
    }

    if (!res.ok) {
      throw new ServiceProviderError("image.openai.generate", res.status, (await res.text()).slice(0, 300));
    }

    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const items = json.data || [];
    if (!items.length || !items[0].b64_json) {
      throw new ServiceProviderError("image.openai.generate", null, "model returned no image");
    }

    const uploaded: Array<{ fileId: string; imageUrl: string }> = [];
    for (let i = 0; i < items.length; i++) {
      const buf = Buffer.from(items[i].b64_json as string, "base64");
      const suffix = items.length > 1 ? `-${i + 1}` : "";
      uploaded.push(await uploadPublicPng(ctx.userId, buf, input.name ? input.name + suffix : undefined));
    }

    return {
      modelId: model,
      data: {
        fileId: uploaded[0].fileId,
        imageUrl: uploaded[0].imageUrl,
        mode: hasRefs ? "edit" : "generate",
        modelId: model,
        images: uploaded,
      },
    };
  },
};
