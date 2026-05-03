/**
 * Source of truth para todo lo que toque créditos.
 *
 * Si quieres reescalar la economía completa (ej. pasar de "9 cr/mes" a
 * "9,000 cr/mes" estilo ElevenLabs), cambia ÚNICAMENTE `CREDIT_SCALE`.
 * Plans, packs, tarifas de proveedores y copy se rederivan automáticamente.
 *
 * Ground truth de costos UNITARIOS (en créditos escalados):
 * - 1 documento profesional = COST_DOC (default scale: 1)
 * - 1 reel avatar 30s        = COST_REEL_30S
 * - 1 minuto de voz clonada   = COST_VOICE_MINUTE (≈ 800 chars en ElevenLabs)
 * - 5 páginas web scrapeadas  = COST_SCRAPE_5
 * - 1 búsqueda web            = COST_SEARCH
 *
 * Plans y packs se exportan en créditos escalados: si cambias CREDIT_SCALE,
 * los números crecen sin tocar el archivo de plans.
 */

/**
 * Multiplier global. Cambia este número para reescalar TODA la economía:
 * - 1     → "9 cr/mes" (números pequeños, perfil "creativo solo")
 * - 1000  → "9,000 cr/mes" (perfil ElevenLabs, números grandes)
 * - 100   → "900 cr/mes" (escala intermedia)
 *
 * IMPORTANTE: si bajas el scale por debajo del current value, la economía
 * cambia retroactivamente — los `AiGenerationLog` históricos tienen costos
 * en la escala que estaba al momento de loguearlos. Solo subirlo es seguro.
 */
export const CREDIT_SCALE = 1000;

// ──────────────────────────────────────────────────────────────────
// COSTOS UNITARIOS (en créditos escalados)
// ──────────────────────────────────────────────────────────────────

/** 1 documento profesional generado por AI (carta, reporte, contrato). */
export const COST_DOC = 1 * CREDIT_SCALE;

/** 1 reel con avatar (30 segundos, 9:16). */
export const COST_REEL_30S = 6 * CREDIT_SCALE;

/** 1 minuto de voz clonada (≈ 800 caracteres procesados). */
export const COST_VOICE_MINUTE = 8 * CREDIT_SCALE;

/** 5 páginas web scrapeadas (research/competitor/catalog). */
export const COST_SCRAPE_5_PAGES = 1 * CREDIT_SCALE;

/** 1 búsqueda web inteligente (Brightdata SERP). */
export const COST_SEARCH = 2 * CREDIT_SCALE;

// ──────────────────────────────────────────────────────────────────
// CRÉDITOS POR PLAN MENSUAL
// ──────────────────────────────────────────────────────────────────

export const PLAN_CREDITS = {
  Byte: 9 * CREDIT_SCALE,
  Mega: 50 * CREDIT_SCALE,
  Tera: 200 * CREDIT_SCALE,
} as const;

// ──────────────────────────────────────────────────────────────────
// PACKS DE RECARGA — tamaños en créditos escalados
// ──────────────────────────────────────────────────────────────────

export const PACK_SIZES = {
  small: 5 * CREDIT_SCALE,
  medium: 10 * CREDIT_SCALE,
  large: 50 * CREDIT_SCALE,
  bulk: 100 * CREDIT_SCALE,
} as const;

// Verticalizados (semanales).
export const PACK_VERTICAL_SIZES = {
  creatorDaily: 200 * CREDIT_SCALE,
  ecommerce: 250 * CREDIT_SCALE,
  research: 300 * CREDIT_SCALE,
  studioPro: 750 * CREDIT_SCALE,
} as const;

// ──────────────────────────────────────────────────────────────────
// TARIFAS DERIVADAS (servicios externos → créditos)
// ──────────────────────────────────────────────────────────────────

/**
 * ElevenLabs TTS: cuántos CARACTERES equivalen a 1 crédito (escalado).
 *
 * Ground truth: 1 minuto de voz ≈ 800 caracteres y queremos que cueste
 * COST_VOICE_MINUTE créditos. Por tanto:
 *   chars/credit = 800 / COST_VOICE_MINUTE
 *
 * Con CREDIT_SCALE=1 → 100 chars/cr (legacy).
 * Con CREDIT_SCALE=1000 → 0.1 chars/cr.
 */
export const TARIFF_ELEVENLABS_CHARS_PER_CREDIT = 800 / COST_VOICE_MINUTE;

/**
 * fal.ai avatar video: cuántos CRÉDITOS por SEGUNDO de video.
 *
 * Ground truth: 30 seg = COST_REEL_30S créditos. Por tanto:
 *   credits/sec = COST_REEL_30S / 30
 *
 * Con CREDIT_SCALE=1 → 0.2 cr/sec (legacy).
 * Con CREDIT_SCALE=1000 → 200 cr/sec.
 */
export const TARIFF_FAL_AVATAR_CREDITS_PER_SECOND = COST_REEL_30S / 30;

// ──────────────────────────────────────────────────────────────────
// HELPERS DE FORMATO
// ──────────────────────────────────────────────────────────────────

/** Format con separador de miles (es-MX). */
export const formatCredits = (n: number): string =>
  new Intl.NumberFormat("es-MX").format(n);
