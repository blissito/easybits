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
 * Multiplier global. Afecta SÓLO los costos por acción y las tarifas de
 * proveedores. Las bandas de plan (PLAN_CREDITS) ya NO se derivan de aquí
 * — son explícitas para tener control fino del rango Byte/Mega/Tera.
 *
 * - 100  → 1 doc = 100 cr · 1 reel = 600 cr · 1 min voz = 800 cr (actual)
 * - 1000 → escala "ElevenLabs" (números muy grandes)
 *
 * IMPORTANTE: si bajas el scale por debajo del current value, la economía
 * cambia retroactivamente — los `AiGenerationLog` históricos tienen costos
 * en la escala que estaba al momento de loguearlos. Solo subirlo es seguro.
 */
export const CREDIT_SCALE = 100;

// ──────────────────────────────────────────────────────────────────
// COSTOS UNITARIOS (en créditos escalados)
// ──────────────────────────────────────────────────────────────────

/** 1 documento profesional generado por AI (PDF/DOCX/XLSX, carta, reporte). */
export const COST_DOC = 1 * CREDIT_SCALE;

/** 1 imagen generada (Fal/OpenAI text-to-image). */
export const COST_IMAGE = 0.5 * CREDIT_SCALE;

/** 1 reel HTML animado (Ghosty / Easybits SDK — cheap, no IA pesada). */
export const COST_REEL_HTML = 1 * CREDIT_SCALE;

/** 1 reel Kling (text-to-video AI, ~5s clip). */
export const COST_REEL_KLING = 4 * CREDIT_SCALE;

/** 1 reel con avatar talking head (30s, 9:16, fal.ai SadTalker/Hallo2). */
export const COST_REEL_AVATAR_30S = 6 * CREDIT_SCALE;

/** Alias retro-compat — antes existía COST_REEL_30S (era el avatar). */
export const COST_REEL_30S = COST_REEL_AVATAR_30S;

/** 1 minuto de voz clonada (≈ 800 caracteres procesados). */
export const COST_VOICE_MINUTE = 8 * CREDIT_SCALE;

/** 5 páginas web scrapeadas (research/competitor/catalog). */
export const COST_SCRAPE_5_PAGES = 1 * CREDIT_SCALE;

/** 1 búsqueda web inteligente (Brightdata SERP). */
export const COST_SEARCH = 2 * CREDIT_SCALE;

// ──────────────────────────────────────────────────────────────────
// CRÉDITOS POR PLAN MENSUAL
// ──────────────────────────────────────────────────────────────────
//
// Bandas explícitas (NO derivadas de CREDIT_SCALE). El número representa
// el TOPE de la banda — cualquier consumo ≤ este número cae en ese plan.
//
//   Byte:     0–999 cr     (Gratis hasta freeUntil; paid hasta tope)
//   Mega:  1,000–10,000 cr (interpolación lineal $499–$2,499)
//   Tera: 10,001–50,000 cr (interpolación lineal $2,999–$7,999)

export const PLAN_CREDITS = {
  Byte: 999,
  Mega: 10000,
  Tera: 50000,
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

// ──────────────────────────────────────────────────────────────────
// eb.compute — LLM managed dentro de sandboxes, cobrado por TOKEN
// ──────────────────────────────────────────────────────────────────
//
// A diferencia del resto (cobro flat por acción), compute mide a token-level:
// una code-gen tiene tokens muy variables y un precio plano se va a rojo en
// llamadas grandes. La config es tuneable en vivo vía AppConfig key
// "compute-config" (ver app/.server/compute/gateway.ts → getComputeConfig),
// con estos defaults — NO en envs, para que todas las instancias del app lean
// la misma fuente sin drift al escalar.

export interface ComputeConfig {
  /** Tipo de cambio USD→MXN para convertir costo de proveedor a pesos. */
  usdToMxn: number;
  /** Horas de vida de una ComputeKey antes de expirar. */
  keyTtlHours: number;
  /** Modelo interno usado cuando el request omite `model`. */
  defaultModel: string;
  /** friendly name (lo teclea el usuario en `model:`) → model id interno. */
  models: Record<string, string>;
  /** model id interno → USD por 1M tokens (margen incluido). */
  rates: Record<string, { in: number; out: number }>;
}

export const COMPUTE_DEFAULTS: ComputeConfig = {
  usdToMxn: 18,
  keyTtlHours: 24,
  defaultModel: "gemini-2.5-flash",
  models: {
    "gemini-flash": "gemini-2.5-flash",
    "gemini-pro": "gemini-2.5-pro",
    "gpt-4o-mini": "gpt-4o-mini",
    "claude-sonnet": "claude-sonnet-4-6",
  },
  // USD por 1M tokens — margen ~2x sobre el costo crudo del proveedor.
  // CONFIRMAR contra el pricing real de cada proveedor antes de subir precios.
  rates: {
    "gemini-2.5-flash": { in: 0.3, out: 2.5 },
    "gemini-2.5-pro": { in: 2.5, out: 15 },
    "gpt-4o-mini": { in: 0.6, out: 2.4 },
    "claude-sonnet-4-6": { in: 6, out: 30 },
  },
};

/** Piso MXN por crédito (escala 1). Protege margen — ver plans.ts. */
const MXN_PER_CREDIT = 5;

/**
 * Convierte tokens de una completion a créditos escalados (CREDIT_SCALE).
 * usd = in/1M·rateIn + out/1M·rateOut; credits = usd·usdToMxn / piso · scale.
 * Mínimo 1 crédito escalado por llamada (≈ 1/100 de un documento).
 */
export function computeCreditsForTokens(
  cfg: ComputeConfig,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const r = cfg.rates[modelId] ?? cfg.rates[cfg.defaultModel];
  const usd = (inputTokens / 1e6) * r.in + (outputTokens / 1e6) * r.out;
  const credits = ((usd * cfg.usdToMxn) / MXN_PER_CREDIT) * CREDIT_SCALE;
  return Math.max(1, Math.ceil(credits));
}

// ──────────────────────────────────────────────────────────────────
// PRICING BANDS — el plan ahora es categoría + precio continuo
// ──────────────────────────────────────────────────────────────────
//
// El total de cr/mes (computado de los sliders del configurador) cae en
// una banda. Dentro de cada banda el precio interpola linealmente entre
// `priceMin` y `priceMax`. Modelo B (interpolación lineal).
//
// IMPORTANTE: las thresholds están escaladas con CREDIT_SCALE — vienen
// de PLAN_CREDITS arriba.

export interface PriceBand {
  /** Etiqueta de plan visible al usuario (Byte/Mega/Tera). */
  plan: "Byte" | "Mega" | "Tera";
  /** Crédito mínimo (inclusive) que cae en esta banda. */
  minCredits: number;
  /** Crédito máximo (inclusive) que cae en esta banda. */
  maxCredits: number;
  /** Precio MXN cuando el usuario está en `minCredits`. */
  priceMin: number;
  /** Precio MXN cuando el usuario llega a `maxCredits`. */
  priceMax: number;
  /** Si la banda tiene zona gratis: el corte hasta el cual cobramos $0. */
  freeUntil?: number;
}

export const PRICE_BANDS: PriceBand[] = [
  // Byte: gratis hasta 5K cr; interpola de $0 a $99 entre 5K y 9K.
  {
    plan: "Byte",
    minCredits: 0,
    maxCredits: PLAN_CREDITS.Byte,
    priceMin: 0,
    priceMax: 99,
    freeUntil: Math.round(PLAN_CREDITS.Byte * 0.55), // ≈ 5K en scale 1000
  },
  // Mega: interpola de $499 a $2,499.
  {
    plan: "Mega",
    minCredits: PLAN_CREDITS.Byte + 1,
    maxCredits: PLAN_CREDITS.Mega,
    priceMin: 499,
    priceMax: 2499,
  },
  // Tera: interpola de $2,999 a $7,999.
  {
    plan: "Tera",
    minCredits: PLAN_CREDITS.Mega + 1,
    maxCredits: PLAN_CREDITS.Tera,
    priceMin: 2999,
    priceMax: 7999,
  },
];

/**
 * Devuelve la banda + precio MXN/mes para un total de créditos. Si excede
 * la banda Tera, devuelve Tera con `priceMxn = priceMax` y un flag de
 * `overage` con la diferencia (que se materializa como recargas en packs).
 */
export interface PlanQuote {
  plan: "Byte" | "Mega" | "Tera";
  priceMxn: number;
  isFree: boolean;
  /** Créditos que exceden la banda más alta — se cobran en packs. */
  overageCredits: number;
}

export const computePlanFromCredits = (totalCredits: number): PlanQuote => {
  // Caso especial: cero o negativo → Byte gratis.
  if (totalCredits <= 0) {
    return { plan: "Byte", priceMxn: 0, isFree: true, overageCredits: 0 };
  }

  const teraCap = PRICE_BANDS[PRICE_BANDS.length - 1].maxCredits;
  if (totalCredits > teraCap) {
    return {
      plan: "Tera",
      priceMxn: PRICE_BANDS[PRICE_BANDS.length - 1].priceMax,
      isFree: false,
      overageCredits: totalCredits - teraCap,
    };
  }

  for (const band of PRICE_BANDS) {
    if (totalCredits >= band.minCredits && totalCredits <= band.maxCredits) {
      // Zona gratis interna de la banda (típicamente Byte).
      if (band.freeUntil && totalCredits <= band.freeUntil) {
        return { plan: band.plan, priceMxn: 0, isFree: true, overageCredits: 0 };
      }
      // Interpolación lineal entre priceMin y priceMax.
      const startCr = band.freeUntil ?? band.minCredits;
      const range = band.maxCredits - startCr;
      const offset = totalCredits - startCr;
      const ratio = range > 0 ? offset / range : 0;
      const interpolated = band.priceMin + (band.priceMax - band.priceMin) * ratio;
      return {
        plan: band.plan,
        priceMxn: Math.round(interpolated),
        isFree: false,
        overageCredits: 0,
      };
    }
  }

  // No debería caer aquí — fallback defensivo.
  return { plan: "Byte", priceMxn: 0, isFree: true, overageCredits: 0 };
};
