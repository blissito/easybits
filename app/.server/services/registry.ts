/**
 * Service Registry — single source of truth for premium services.
 *
 * To add a new service:
 *   1. Create an adapter in `providers/<name>.ts` exporting a `ServiceDef`.
 *   2. Import + add to `SERVICES` below.
 *   3. (Optional) Wrap as MCP tool calling `consumeService("<id>", input, ctx)`.
 *   4. (Optional) Reference its `id` in pack `recipe[]` arrays in `app/lib/plans.ts`.
 *
 * ServiceId is derived as `keyof typeof SERVICES`, giving type-safe access.
 *
 * Catálogo objetivo (extraído del cotizador `app/lib/quiz/capabilities.ts`):
 *   - voice.elevenlabs.tts / .stt / .clone     → ElevenLabs (TODO Fase 4)
 *   - image.fal.generate / .openai.generate    → Fal / OpenAI (TODO Fase 4)
 *   - image.transform                           → Editing/transforms (TODO Fase 4)
 *   - video.runway.gen45 / .turbo / .still     → Runway (migración Fase 4 desde videoOperations.ts)
 *   - video.fal.avatar                         → fal.ai talking-head (✅ implementado, pay-per-use, sin subscription)
 *   - video.heygen.avatar                      → HeyGen avatar premium (TODO V2 — cuando haya volumen)
 *   - research.brightdata.scrape / .search     → Brightdata web research (TODO Fase 4)
 *   - doc.easybits.generate / .refine / .variant → Documentos nativos (migración Fase 4)
 *
 * Excluido: Canva — sustituido por `doc.easybits.*`.
 */
import type { ServiceDef } from "./types";
import { falAvatarService, falImageService } from "./providers/fal";
import { geminiEditImageService } from "./providers/gemini";
import { elevenLabsTtsService } from "./providers/elevenlabs";
import {
  brightdataScrapeService,
  brightdataSearchService,
} from "./providers/brightdata";

export const SERVICES = {
  "video.fal.avatar": falAvatarService,
  "voice.elevenlabs.tts": elevenLabsTtsService,
  "research.brightdata.scrape": brightdataScrapeService,
  "research.brightdata.search": brightdataSearchService,
  "image.fal.generate": falImageService,
  "image.gemini.edit": geminiEditImageService,
  // Reservados — implementación pendiente:
  // "voice.elevenlabs.stt": elevenLabsSttService,
  // "image.openai.generate": openaiImageService,
  // "image.transform": imageTransformService,
  // "video.runway.gen45": runwayGen45Service,
  // "video.runway.turbo": runwayTurboService,
  // "video.heygen.avatar": heygenAvatarService,
  // "doc.easybits.generate": easybitsDocGenerateService,
  // "doc.easybits.refine": easybitsDocRefineService,
  // "doc.easybits.variant": easybitsDocVariantService,
} as const satisfies Record<string, ServiceDef<any, any>>;

export type ServiceId = keyof typeof SERVICES;

export function getService(id: string): ServiceDef | undefined {
  return (SERVICES as Record<string, ServiceDef>)[id];
}
