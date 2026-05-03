/**
 * Service Catalog types.
 *
 * Single source of truth for premium services exposed to users via MCP / SDK / API.
 * Each service in `registry.ts` implements `ServiceDef` — adding a new provider
 * (HeyGen, ElevenLabs, fal.ai, etc.) means: 1 adapter file + 1 registry entry.
 *
 * The orchestrator in `consume.ts` reuses `aiGenerationLimit.ts` for credit
 * accounting — services NEVER touch credits, logs, or Stripe directly.
 */

export type ServiceProduct = "doc" | "video" | "voice" | "image" | "avatar" | "research";

export interface ServiceCtx {
  userId: string;
  userPlan?: string;
  /** Optional: link the operation to an existing resource (document, landing, etc.). */
  resourceId?: string;
}

export interface ServiceResult {
  /** Whatever the provider returned, plus optional metadata for logging. */
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Operation-specific payload returned to the caller. */
  data: unknown;
}

export interface ServiceDef<I = unknown, O extends ServiceResult = ServiceResult> {
  /** Dotted ID, used as `AiGenerationLog.type`. Examples: "video.hedra.avatar", "voice.elevenlabs.tts". */
  id: string;
  product: ServiceProduct;
  displayName: string;
  description: string;
  /**
   * Cost in "créditos" (1 crédito ≈ $1.17 MXN costo neto; retail tope $7 MXN). Must be ≥1.
   * For variable-cost services, compute from input (e.g. duration, character count).
   */
  estimateCost(input: I): number;
  /** Run the actual provider call. Must NOT touch credits/logs — that's the orchestrator's job. */
  execute(input: I, ctx: ServiceCtx): Promise<O>;
}
