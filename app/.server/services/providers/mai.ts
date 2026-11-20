/**
 * Microsoft MAI Image 2.7 en fal.ai — generación y edición baratas.
 *
 * Dos servicios:
 *   - image.mai.generate → microsoft/mai-image-2.7[/flash]/text-to-image
 *   - image.mai.edit     → microsoft/mai-image-2.7[/flash]/edit (máx. 5 referencias, sin máscara)
 *
 * Una imagen por llamada a fal; `n` > 1 hace N llamadas (variantes de boceto).
 * El router `routeImageModel` decide cuándo usar MAI y cuándo OpenAI.
 */
import { nanoid } from "nanoid";
import { COST_DOC } from "~/lib/credits";
import { ServiceProviderError } from "../errors";
import { uploadPublicImage } from "../uploadImage";
import type { ServiceCtx, ServiceDef, ServiceResult } from "../types";
import { falQueue } from "./fal";

export type MaiTier = "flash" | "full";
export type MaiImageSize =
  | "square_hd"
  | "portrait_4_3"
  | "landscape_4_3"
  | "portrait_3_2"
  | "landscape_3_2"
  | "portrait_16_9"
  | "landscape_16_9";

export const MAI_MAX_REFS = 5;

export interface MaiImageInput {
  prompt: string;
  /** flash (default, ~$0.0102/img 1K) o full (MAI 2.7, ~$0.0348/img 1K). */
  tier?: MaiTier;
  imageSize?: MaiImageSize;
  resolution?: "1K" | "2K";
  background?: "opaque" | "transparent";
  /** Sólo edit: URLs https o data URIs (máx. 5). */
  imageUrls?: string[];
  n?: number;
  name?: string;
}

export interface MaiImageOutput extends ServiceResult {
  data: {
    fileId: string;
    imageUrl: string;
    mode: "edit" | "generate";
    modelId: string;
    images: Array<{ fileId: string; imageUrl: string }>;
  };
}

/**
 * Costo en créditos, misma escala que OpenAI (COST_DOC = 100 cr ≈ $5 MXN).
 * Upstream 1K: Flash ~$0.0102 (≈ $0.18 MXN ≈ 4 cr) y 2.7 ~$0.0348 (≈ $0.63 MXN ≈ 13 cr).
 * Cobramos Flash = 0.25 × COST_DOC (25 cr) y 2.7 = 1 × COST_DOC (100 cr): margen ~85%,
 * y Flash queda 4× más barato que gpt-image-2 low para el usuario.
 * 2K usa ~4× tokens → ×2 de cobro (margen sigue > 40% en Flash).
 */
export function maiCostCredits(input: Pick<MaiImageInput, "tier" | "resolution" | "n">): number {
  const perImage = (input.tier === "full" ? 1 : 0.25) * COST_DOC;
  const res = input.resolution === "2K" ? 2 : 1;
  return perImage * res * Math.max(1, input.n ?? 1);
}

export function maiEndpoint(tier: MaiTier, mode: "generate" | "edit"): string {
  const base = tier === "full" ? "microsoft/mai-image-2.7" : "microsoft/mai-image-2.7/flash";
  return `${base}/${mode === "edit" ? "edit" : "text-to-image"}`;
}

/** Ratio libre ("16:9", "1024x1536"…) → enum `image_size` de MAI. */
export function toMaiImageSize(ratio?: string): MaiImageSize {
  switch (ratio) {
    case "16:9":
    case "21:9":
      return "landscape_16_9";
    case "9:16":
      return "portrait_16_9";
    case "4:3":
    case "5:4":
      return "landscape_4_3";
    case "3:4":
    case "4:5":
      return "portrait_4_3";
    case "3:2":
    case "1536x1024":
      return "landscape_3_2";
    case "2:3":
    case "1024x1536":
      return "portrait_3_2";
    default:
      return "square_hd";
  }
}

// ── Router ──────────────────────────────────────────────────────────

export interface ImageIntent {
  stage?: "sketch" | "final";
  refs?: number;
  mask?: boolean;
  quality?: "low" | "medium" | "high" | "auto";
  transparent?: boolean;
}

export type ImageRoute =
  | { provider: "openai"; reason: string }
  | { provider: "mai"; tier: MaiTier; reason: string };

/**
 * El agente declara la intención; el código elige el modelo.
 * OpenAI: final, máscara, más referencias de las que acepta MAI o calidad medium/high.
 * MAI: bocetos (Flash) y transparencia (2.7).
 */
export function routeImageModel(i: ImageIntent): ImageRoute {
  if (i.mask) return { provider: "openai", reason: "mask" };
  if ((i.refs ?? 0) > MAI_MAX_REFS - 1) return { provider: "openai", reason: "refs>4" };
  if (i.stage === "final") return { provider: "openai", reason: "final" };
  if (i.quality === "medium" || i.quality === "high") return { provider: "openai", reason: `quality:${i.quality}` };
  if (i.transparent) return { provider: "mai", tier: "full", reason: "transparent" };
  return { provider: "mai", tier: "flash", reason: "sketch" };
}

// ── Servicios ───────────────────────────────────────────────────────

async function runMai(mode: "generate" | "edit", input: MaiImageInput, ctx: ServiceCtx): Promise<MaiImageOutput> {
  const serviceId = mode === "edit" ? "image.mai.edit" : "image.mai.generate";
  const prompt = input.prompt?.trim();
  if (!prompt) throw new ServiceProviderError(serviceId, 400, "prompt is required");
  const refs = input.imageUrls ?? [];
  if (mode === "edit" && refs.length === 0) throw new ServiceProviderError(serviceId, 400, "edit needs at least one image");
  if (refs.length > MAI_MAX_REFS) throw new ServiceProviderError(serviceId, 400, `max ${MAI_MAX_REFS} reference images`);

  const tier = input.tier ?? "flash";
  const modelId = maiEndpoint(tier, mode);
  const payload: Record<string, unknown> = {
    prompt,
    image_size: input.imageSize ?? "square_hd",
    resolution: input.resolution ?? "1K",
    background: input.background ?? "opaque",
    output_format: "png",
  };
  if (mode === "edit") payload.image_urls = refs;

  const n = Math.min(4, Math.max(1, input.n ?? 1));
  // Una imagen por llamada: las variantes van en paralelo.
  const urls = await Promise.all(
    Array.from({ length: n }, async () => {
      const resp = (await falQueue<unknown>(modelId, payload)) as Record<string, any>;
      const url: string | null = resp?.images?.[0]?.url ?? resp?.image?.url ?? null;
      if (!url) throw new ServiceProviderError(serviceId, null, `no image URL: ${JSON.stringify(resp).slice(0, 300)}`);
      return url;
    }),
  );

  const images: Array<{ fileId: string; imageUrl: string }> = [];
  for (let i = 0; i < urls.length; i++) {
    const r = await fetch(urls[i]);
    if (!r.ok) throw new ServiceProviderError(serviceId, r.status, "download failed");
    const contentType = (r.headers.get("content-type") || "image/png").split(";")[0];
    const suffix = urls.length > 1 ? `-${i + 1}` : "";
    images.push(
      await uploadPublicImage(ctx.userId, Buffer.from(await r.arrayBuffer()), {
        contentType,
        source: "fal",
        name: (input.name || `mai-${nanoid(6)}`) + suffix,
        serviceId,
      }),
    );
  }

  return {
    modelId,
    data: { fileId: images[0].fileId, imageUrl: images[0].imageUrl, mode, modelId, images },
  };
}

export const maiGenerateService: ServiceDef<MaiImageInput, MaiImageOutput> = {
  id: "image.mai.generate",
  product: "image",
  displayName: "Image Generate (MAI Image 2.7 / Flash)",
  description: "Genera imágenes con Microsoft MAI Image 2.7 (Flash por default) vía fal.ai.",
  estimateCost: maiCostCredits,
  execute: (input, ctx) => runMai("generate", input, ctx),
};

export const maiEditService: ServiceDef<MaiImageInput, MaiImageOutput> = {
  id: "image.mai.edit",
  product: "image",
  displayName: "Image Edit (MAI Image 2.7 / Flash)",
  description: "Edita imágenes con referencias (máx. 5, sin máscara) con MAI Image 2.7 vía fal.ai.",
  estimateCost: maiCostCredits,
  execute: (input, ctx) => runMai("edit", input, ctx),
};

/** Bytes → data URI: fal acepta data URIs en `image_urls`, así no hay que publicar las referencias. */
export function toDataUri(img: { data: Uint8Array; mediaType: string }): string {
  return `data:${img.mediaType || "image/png"};base64,${Buffer.from(img.data).toString("base64")}`;
}

/** Tamaño OpenAI desde un ratio, para cuando el router escala a gpt-image-2. */
export function toOpenaiSize(ratio?: string): "1024x1024" | "1536x1024" | "1024x1536" {
  const s = toMaiImageSize(ratio);
  if (s.startsWith("landscape")) return "1536x1024";
  if (s.startsWith("portrait")) return "1024x1536";
  return "1024x1024";
}
