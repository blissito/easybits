/**
 * Vision describe adapter — analiza una imagen y devuelve descripción + OCR.
 *
 * A diferencia del resto de tools de imagen (que GENERAN o EDITAN), esta sólo
 * LEE: recibe imagen(es) + una pregunta opcional y devuelve texto. Cubre el gap
 * de "vision" que faltaba en el catálogo MCP.
 *
 * Usa la PLATFORM key (`GOOGLE_GENERATIVE_AI_API_KEY`) y gemini-2.5-flash —
 * rápido, barato (~$0.02 MXN/llamada) y con OCR sólido. El costo se cobra como
 * 1 crédito (piso) por el orquestador (consume.ts).
 */
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { ServiceConfigError, ServiceProviderError } from "../errors";
import type { ServiceCtx, ServiceDef, ServiceResult } from "../types";

const MODEL_ID = process.env.DESCRIBE_IMAGE_MODEL || "gemini-2.5-flash";

export interface DescribeImageInput {
  /** Imagen(es) a analizar. Normalmente una sola. */
  images: Array<{ data: Uint8Array; mediaType: string }>;
  /** Pregunta específica sobre la imagen. Si se omite, describe en detalle. */
  question?: string;
}

export interface DescribeImageOutput extends ServiceResult {
  data: {
    description: string;
    modelId: string;
  };
}

function getApiKey(): string {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new ServiceConfigError("image.gemini.describe", "GOOGLE_GENERATIVE_AI_API_KEY");
  return key;
}

const DEFAULT_PROMPT =
  "Describe esta imagen en detalle: qué muestra, objetos/personas, colores, " +
  "estilo y composición. Si hay texto visible, transcríbelo literalmente (OCR) " +
  "en una sección aparte titulada 'Texto:'. Responde en el idioma del texto de " +
  "la imagen, o en español si no hay texto.";

export const describeImageService: ServiceDef<DescribeImageInput, DescribeImageOutput> = {
  id: "image.gemini.describe",
  product: "image",
  displayName: "Image Describe / OCR (Gemini Flash)",
  description:
    "Analiza una imagen y devuelve una descripción en texto + transcripción del texto visible (OCR), opcionalmente respondiendo una pregunta específica. Usa gemini-2.5-flash.",
  estimateCost() {
    return 1; // vision read barata — 1 crédito (piso de consumeService).
  },
  async execute(input, _ctx: ServiceCtx) {
    if (!input.images?.length) {
      throw new ServiceProviderError("image.gemini.describe", 400, "at least one image is required");
    }
    const google = createGoogleGenerativeAI({ apiKey: getApiKey() });

    const instruction = input.question?.trim()
      ? `${input.question.trim()}\n\nAdemás, si hay texto visible en la imagen, transcríbelo literalmente (OCR) en una sección aparte titulada 'Texto:'.`
      : DEFAULT_PROMPT;

    const content: Array<Record<string, unknown>> = [];
    for (const img of input.images) {
      content.push({ type: "image", image: img.data, mediaType: img.mediaType });
    }
    content.push({ type: "text", text: instruction });

    let result: Awaited<ReturnType<typeof generateText>>;
    try {
      result = await generateText({
        model: google(MODEL_ID),
        messages: [{ role: "user", content: content as never }],
      });
    } catch (e: any) {
      throw new ServiceProviderError(
        "image.gemini.describe",
        e?.statusCode ?? e?.status ?? null,
        e?.message || "Gemini vision call failed",
      );
    }

    const description = (result.text || "").trim();
    if (!description) {
      throw new ServiceProviderError("image.gemini.describe", null, "model returned no description");
    }

    return {
      modelId: MODEL_ID,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      data: { description, modelId: MODEL_ID },
    };
  },
};
