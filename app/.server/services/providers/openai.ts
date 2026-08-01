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
import { ServiceConfigError, ServiceProviderError } from "../errors";
import { uploadPublicImage } from "../uploadImage";
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
 * Guarda el PNG generado en el storage público del usuario.
 *
 * La lógica (colisión de storageKey, retry por P2002, alta en `File`) vive en
 * `../uploadImage` desde que la comparte la búsqueda de fotos de stock. Este
 * wrapper sólo fija el content-type y el `source` de este proveedor.
 */
async function uploadPublicPng(
  userId: string,
  buffer: Buffer,
  name?: string,
): Promise<{ fileId: string; imageUrl: string }> {
  return uploadPublicImage(userId, buffer, {
    contentType: "image/png",
    source: "openai",
    name: name || `gpt-image-${nanoid(6)}`,
    serviceId: "image.openai.generate",
  });
}

export const openaiImageService: ServiceDef<OpenaiImageInput, OpenaiImageOutput> = {
  id: "image.openai.generate",
  product: "image",
  displayName: "Image Generate/Edit (OpenAI gpt-image-2)",
  description:
    "Genera o edita imágenes con gpt-image-2. Con imagen(es) de referencia EDITA (fiel a la composición); sin referencia genera desde el prompt.",
  // Costo upstream real gpt-image-2 (jun 2026, billing por tokens, ref. 1024×1024):
  //   low ~$0.006 · medium ~$0.053 · high ~$0.211 USD/imagen (~$0.11 · $1.00 · $3.90 MXN @18.5).
  //   Editar añade input-image tokens (~centavos). Cobramos COST_DOC (1 gen = 100 cr) por
  //   nivel + 1 al editar → margen ~95% en low (default), ~57% en el peor caso (generar high).
  //   Si el prompt/imagen de referencia crece, el costo por tokens sube; revisar si cambia el modelo.
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
