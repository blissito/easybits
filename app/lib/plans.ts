/**
 * Single source of truth for plan pricing across the app.
 * Update prices here — they propagate to /developers, /planes, profile, etc.
 *
 * NOTA: los valores de `aiGenerationsPerMonth` y `generations` (en
 * GENERATION_PACKS) NO viven aquí — vienen de `app/lib/credits.ts`. Si
 * quieres reescalar la economía completa de créditos, edita
 * `CREDIT_SCALE` en ese archivo.
 */

import {
  formatCredits,
  COST_DOC,
  PACK_SIZES,
  PACK_VERTICAL_SIZES,
  PLAN_CREDITS,
} from "./credits";

export type PlanKey = "Byte" | "Mega" | "Tera";

export interface PlanConfig {
  /** Display name */
  name: string;
  /** Monthly price in MXN */
  price: number;
  /** Max storage in GB */
  storageGB: number;
  /** AI generations per month (null = unlimited) */
  aiGenerationsPerMonth: number | null;
  /** LLM proxy tokens free per month (GhostyCode). Byte=5M, Mega=50M, Tera=250M. */
  llmTokensFreePerMonth: number;
  /** Max concurrent ACTIVE sandboxes (running/starting). Enforced in createSandbox. */
  concurrentSandboxes: number;
  /** Max sandbox session length in seconds (TTL window). Mega 1h, Tera 24h. Enforced in create/extend. */
  maxSandboxTtlSeconds: number;
  /** Stripe intent key (null for free) */
  stripeIntent: string | null;
  /** Features list for pricing cards */
  features: string[];
}

export const PLANS: Record<PlanKey, PlanConfig> = {
  Byte: {
    name: "Byte",
    price: 0,
    storageGB: 0.1,
    aiGenerationsPerMonth: PLAN_CREDITS.Byte,
    llmTokensFreePerMonth: 5_000_000, // 5M tokens gratis/mes
    concurrentSandboxes: 2,
    maxSandboxTtlSeconds: 3600,
    stripeIntent: null,
    features: [
      "100 MB de almacenamiento",
      `${formatCredits(PLAN_CREDITS.Byte)} créditos AI/mes incluidos`,
      "MCP + SDK + API",
      "Webhooks",
      "Landing pages",
      "Branding 'Powered by' en landings",
      "Preview de archivos",
      "3 bases de datos",
      "7 días de papelera",
      "Packs de créditos desde $39",
    ],
  },
  Mega: {
    name: "Mega",
    price: 299,
    storageGB: 10,
    aiGenerationsPerMonth: PLAN_CREDITS.Mega,
    llmTokensFreePerMonth: 50_000_000, // 50M tokens/mes incluidos
    concurrentSandboxes: 3,
    maxSandboxTtlSeconds: 3600,
    stripeIntent: "flow_plan",
    features: [
      "10 GB de almacenamiento",
      `${formatCredits(PLAN_CREDITS.Mega)} créditos AI/mes incluidos`,
      "Todo lo de Byte",
      "10 bases de datos",
      "Sandboxes: 3 simultáneos · kernel Python + URLs públicas",
      "Subidas ilimitadas",
      "Sin branding en landings",
      "Websites estáticos",
      "Streaming HLS",
      "Transformación de imágenes",
      "Packs de créditos desde $39",
    ],
  },
  Tera: {
    name: "Tera",
    price: 1499,
    storageGB: 100,
    aiGenerationsPerMonth: PLAN_CREDITS.Tera,
    llmTokensFreePerMonth: 250_000_000, // 250M tokens/mes incluidos
    concurrentSandboxes: 10,
    maxSandboxTtlSeconds: 86400,
    stripeIntent: "studio_plan",
    features: [
      "100 GB de almacenamiento",
      `${formatCredits(PLAN_CREDITS.Tera)} créditos AI/mes incluidos`,
      "Todo lo de Mega",
      "20 bases de datos",
      "Sandboxes: 10 simultáneos · sesiones de 24h",
      "Proveedores custom",
      "Dominios custom",
      "Soporte prioritario",
      "Packs de créditos desde $39",
      "RAG as a Service (próximamente)",
    ],
  },
};

/** Map old DB names → new keys (backwards compat) */
const PLAN_ALIASES: Record<string, PlanKey> = { Spark: "Byte", Flow: "Mega", Studio: "Tera" };

/** Resolve raw plan string (from DB metadata/roles) to PlanKey */
export function normalizePlan(raw?: string | null): PlanKey {
  if (!raw) return "Byte";
  if (raw in PLANS) return raw as PlanKey;
  return PLAN_ALIASES[raw] ?? "Byte";
}

/** Resolve PlanKey from user roles + metadata */
export function getUserPlan(user: { roles?: string[]; metadata?: unknown }): PlanKey {
  const meta = (user.metadata as any)?.plan as string | undefined;
  const roles = user.roles as string[] | undefined;
  // Check from highest to lowest (new + old names)
  for (const [key, aliases] of [["Tera", ["Tera", "Studio"]], ["Mega", ["Mega", "Flow"]]] as const) {
    for (const name of aliases) {
      if (roles?.includes(name) || meta === name) return key as PlanKey;
    }
  }
  return "Byte";
}

/** Is this a paid plan? */
export function isPaidPlan(plan: PlanKey): boolean {
  return PLANS[plan].price > 0;
}

/** Next plan for upsell (null if highest) */
export const NEXT_PLAN: Partial<Record<PlanKey, PlanKey>> = { Byte: "Mega", Mega: "Tera" };

/** Legacy lookup for profile storage bar (key: plan name, value: { price, max }) */
export const plansLegacy: Record<string, Record<string, number>> = Object.fromEntries(
  Object.entries(PLANS).map(([key, p]) => [key, { price: p.price, max: p.storageGB }])
);

/** Format price for display: "$199 mxn" or "$0" */
export function formatPrice(price: number): string {
  return price === 0 ? "$0" : `$${price}`;
}

/**
 * A single line of a pack's "recipe" — illustrates what the user can DO with the
 * pack's créditos in a typical use case. Cosmetic only — the user is free to spend
 * créditos on any service. Backend consumes `generations`, ignores `recipe`.
 */
export interface PackRecipeLine {
  /** ServiceId from `app/.server/services/registry.ts`. */
  service: string;
  /** Estimated count of operations this represents (e.g. 30 reels, 60 minutes, etc.). */
  count: number;
  /** Human-readable label for the card. */
  label: string;
}

export interface GenerationPack {
  id: string;
  generations: number;
  prices: Record<PlanKey, number>;
  /** Optional promo price (flat, ignores plan) */
  promoPrice?: number;
  /** Promo label e.g. "Lanzamiento" */
  promoLabel?: string;
  /** Highlight this pack visually */
  featured?: boolean;
  /** Short catchy description */
  description?: string;
  /** Display label for thematic packs (e.g. "Creator Daily"). Falls back to id-based label. */
  label?: string;
  /** Card emoji for visual recipe layout. */
  emoji?: string;
  /** One-line audience hint shown above recipe ("Influencer publicando diario"). */
  audience?: string;
  /** Recipe breakdown — purely cosmetic, used by UI to render "qué te rinde" cards. */
  recipe?: PackRecipeLine[];
}

// Referral system constants — expresados en créditos escalados.
// Se derivan de COST_DOC (1 documento) para que NUNCA se desfasen si cambia
// CREDIT_SCALE en credits.ts. La intención original era N generaciones:
//   signup = 3 docs · upgrade = 10 docs · welcome = 2 docs.
export const REFERRAL_SIGNUP_BONUS = 3 * COST_DOC;   // referrer earns on signup (3 docs)
export const REFERRAL_UPGRADE_BONUS = 10 * COST_DOC; // referrer earns if referred upgrades to paid (10 docs)
export const REFERRAL_WELCOME_BONUS = 2 * COST_DOC;  // referred earns on signup (2 docs)
export const MAX_REFERRALS = 50;                     // anti-abuse cap

// Pricing rebalance (May 2026): piso de $5 MXN/crédito — protege margen del
// costo promedio ($1.17 MXN/gen Gemini Pro) considerando que el mismo crédito
// puede gastarse en operaciones más caras (avatar fal.ai, voz ElevenLabs).
// Curva descendente real: cada pack más grande = $/cr menor que el anterior,
// para que comprar volumen siempre tenga sentido económico.
//
// Curva final ($/cr): 5→7.80, 10→6.90, 50→5.98, 100→5.49, 800→5.31,
// 1000→5.20, 1200→5.08, 3000→5.00. Sin diferenciación por plan en
// packs grandes — el plan premia con créditos mensuales incluidos, no
// con descuento de pack.
//
// Orden: ascendente por número de créditos para que la grid en /dash/packs
// se vea ordenada (los temáticos quedan intercalados según su tamaño).
export const GENERATION_PACKS: GenerationPack[] = [
  // Packs originales (sin recipe — créditos genéricos). Tamaños desde
  // PACK_SIZES en credits.ts para que reescalar la economía sea 1 número.
  { id: "pack_5", generations: PACK_SIZES.small, prices: { Byte: 39, Mega: 39, Tera: 39 }, description: "Perfecto para crear un documento profesional" },
  { id: "pack_10", generations: PACK_SIZES.medium, prices: { Byte: 69, Mega: 69, Tera: 69 }, description: "Ideal para una landing page completa con variantes" },
  { id: "pack_50", generations: PACK_SIZES.large, prices: { Byte: 299, Mega: 299, Tera: 299 }, featured: true, description: "Crea todo un sitio web con múltiples páginas" },
  { id: "pack_100", generations: PACK_SIZES.bulk, prices: { Byte: 549, Mega: 549, Tera: 549 }, description: "Para equipos y proyectos a gran escala" },

  // Packs temáticos (semanales). El motor sigue procesando solo
  // `generations`; el recipe es cosmético para comunicar caso de uso.
  // Diseñados para 1 SEMANA al ritmo típico — pricing más accesible que
  // los packs mensuales que veníamos manejando antes.
  // Ordenados por tamaño ascendente.
  {
    id: "pack_creator_daily",
    label: "Creator Daily",
    emoji: "🎬",
    audience: "Influencer publicando diario en redes",
    generations: PACK_VERTICAL_SIZES.creatorDaily,
    prices: { Byte: 1099, Mega: 1099, Tera: 1099 },
    description: "1 semana de reels con avatar + voz clonada + landings",
    recipe: [
      { service: "video.fal.avatar", count: 7, label: "7 reels avatar 30s" },
      { service: "voice.elevenlabs.tts", count: 15, label: "15 min voz clonada" },
      { service: "doc.easybits.generate", count: 13, label: "13 docs/landings" },
    ],
  },
  {
    id: "pack_ecommerce_catalogo",
    label: "Catálogo Ecommerce",
    emoji: "🛍️",
    audience: "Tienda online actualizando producto",
    generations: PACK_VERTICAL_SIZES.ecommerce,
    prices: { Byte: 1299, Mega: 1299, Tera: 1299 },
    description: "1 semana de imágenes producto + fichas + reels demo",
    recipe: [
      { service: "image.fal.generate", count: 100, label: "100 imágenes producto" },
      { service: "doc.easybits.generate", count: 25, label: "25 fichas técnicas" },
      { service: "video.fal.avatar", count: 5, label: "5 reels demo" },
    ],
  },
  {
    id: "pack_research_design",
    label: "Research & Design",
    emoji: "🔎",
    audience: "Equipo de marketing investigando competencia",
    generations: PACK_VERTICAL_SIZES.research,
    prices: { Byte: 1549, Mega: 1549, Tera: 1549 },
    description: "1 semana de scrape web + imágenes + docs con datos frescos",
    recipe: [
      { service: "research.brightdata.scrape", count: 200, label: "200 páginas web scrape" },
      { service: "image.fal.generate", count: 50, label: "50 imágenes generadas" },
      { service: "doc.easybits.generate", count: 20, label: "20 documentos" },
    ],
  },
  {
    id: "pack_studio_pro",
    label: "Studio Pro",
    emoji: "🎙",
    audience: "Productora con varios clientes activos",
    generations: PACK_VERTICAL_SIZES.studioPro,
    prices: { Byte: 3799, Mega: 3799, Tera: 3799 },
    description: "1 semana de volumen alto: avatar + voz scale + scrape pesado",
    recipe: [
      { service: "video.fal.avatar", count: 25, label: "25 reels avatar" },
      { service: "voice.elevenlabs.tts", count: 60, label: "60 min voz" },
      { service: "research.brightdata.scrape", count: 375, label: "375 páginas scrape" },
      { service: "image.fal.generate", count: 100, label: "100 imágenes" },
    ],
  },
];

// ─── LLM Token Packs ─────────────────────────────────────────────────────
// Precios a 10x sobre costo blended DeepSeek V4 Pro (~$5.51 MXN/1M tokens).
// Curva plana — el margen se mantiene constante porque DeepSeek no da
// descuento por volumen en su API pública.

export interface LlmTokenPack {
  id: string;
  /** Tokens incluidos (ej. 5_000_000 = 5M) */
  tokens: number;
  /** Precio único en MXN (sin diferenciación por plan) */
  price: number;
  /** Highlight visual */
  featured?: boolean;
  /** Short description */
  description?: string;
}

export const LLM_TOKEN_PACKS: LlmTokenPack[] = [
  {
    id: "llm_5m",
    tokens: 5_000_000,
    price: 279,
    description: "Perfecto para probar el proxy LLM en desarrollo",
  },
  {
    id: "llm_10m",
    tokens: 10_000_000,
    price: 549,
    description: "Ideal para agentes que usan GhostyCode a diario",
  },
  {
    id: "llm_50m",
    tokens: 50_000_000,
    price: 2749,
    featured: true,
    description: "Para equipos con múltiples agentes en producción",
  },
  {
    id: "llm_100m",
    tokens: 100_000_000,
    price: 5499,
    description: "Volumen pesado — pipelines, CI/CD con LLM, crawling",
  },
];
