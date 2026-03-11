/**
 * Single source of truth for plan pricing across the app.
 * Update prices here — they propagate to /developers, /planes, profile, etc.
 */

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
  /** Stripe intent key (null for free) */
  stripeIntent: string | null;
  /** Features list for pricing cards */
  features: string[];
}

export const PLANS: Record<PlanKey, PlanConfig> = {
  Byte: {
    name: "Byte",
    price: 0,
    storageGB: 1,
    aiGenerationsPerMonth: 5,
    stripeIntent: null,
    features: [
      "1 GB de almacenamiento",
      "5 generaciones AI/mes incluidas",
      "MCP + SDK + API",
      "Webhooks",
      "Landing pages",
      "Branding 'Powered by' en landings",
      "Preview de archivos",
      "7 días de papelera",
      "Packs de generaciones desde $49",
    ],
  },
  Mega: {
    name: "Mega",
    price: 199,
    storageGB: 50,
    aiGenerationsPerMonth: 50,
    stripeIntent: "flow_plan",
    features: [
      "50 GB de almacenamiento",
      "50 generaciones AI/mes incluidas",
      "Todo lo de Byte",
      "Subidas ilimitadas",
      "Sin branding en landings",
      "Websites estáticos",
      "Streaming HLS",
      "Transformación de imágenes",
      "Packs de generaciones desde $39",
    ],
  },
  Tera: {
    name: "Tera",
    price: 999,
    storageGB: 500,
    aiGenerationsPerMonth: 200,
    stripeIntent: "studio_plan",
    features: [
      "500 GB de almacenamiento",
      "200 generaciones AI/mes incluidas",
      "Todo lo de Mega",
      "Proveedores custom",
      "Dominios custom",
      "Soporte prioritario",
      "Packs de generaciones desde $29",
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
}

// Referral system constants
export const REFERRAL_SIGNUP_BONUS = 3;    // referrer earns on signup
export const REFERRAL_UPGRADE_BONUS = 10;  // referrer earns if referred upgrades to paid
export const REFERRAL_WELCOME_BONUS = 2;   // referred earns on signup
export const MAX_REFERRALS = 50;           // anti-abuse cap

export const GENERATION_PACKS: GenerationPack[] = [
  { id: "pack_10", generations: 10, prices: { Byte: 49, Mega: 39, Tera: 29 } },
  { id: "pack_50", generations: 50, prices: { Byte: 199, Mega: 169, Tera: 149 }, promoPrice: 99, promoLabel: "Lanzamiento", featured: true },
  { id: "pack_100", generations: 100, prices: { Byte: 349, Mega: 249, Tera: 249 } },
];
