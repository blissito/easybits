/**
 * Single source of truth for plan pricing across the app.
 * Update prices here — they propagate to /developers, /planes, profile, etc.
 */

export type PlanKey = "Spark" | "Flow" | "Studio";

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
  Spark: {
    name: "Spark",
    price: 0,
    storageGB: 1,
    aiGenerationsPerMonth: 5,
    stripeIntent: null,
    features: [
      "1 GB de almacenamiento",
      "MCP + SDK + API",
      "Webhooks",
      "Landing pages",
      "Branding 'Powered by' en landings",
      "Preview de archivos",
      "7 días de papelera",
    ],
  },
  Flow: {
    name: "Flow",
    price: 199,
    storageGB: 50,
    aiGenerationsPerMonth: 50,
    stripeIntent: "flow_plan",
    features: [
      "50 GB de almacenamiento",
      "Todo lo de Spark",
      "Subidas ilimitadas",
      "Sin branding en landings",
      "Websites estáticos",
      "Streaming HLS",
      "Transformación de imágenes",
    ],
  },
  Studio: {
    name: "Studio",
    price: 999,
    storageGB: 500,
    aiGenerationsPerMonth: null,
    stripeIntent: "studio_plan",
    features: [
      "500 GB de almacenamiento",
      "Todo lo de Flow",
      "Proveedores custom",
      "Dominios custom",
      "Soporte prioritario",
      "RAG as a Service (próximamente)",
    ],
  },
};

/** Legacy lookup for profile storage bar (key: plan name, value: { price, max }) */
export const plansLegacy: Record<string, Record<string, number>> = Object.fromEntries(
  Object.entries(PLANS).map(([key, p]) => [key, { price: p.price, max: p.storageGB }])
);

/** Format price for display: "$199 mxn" or "$0" */
export function formatPrice(price: number): string {
  return price === 0 ? "$0" : `$${price}`;
}
