/**
 * Single source of truth for plan pricing across the app.
 * Update prices here — they propagate to /developers, /planes, profile, etc.
 */

export type PlanKey = "Gratis" | "Pro" | "Business";

export interface PlanConfig {
  /** Display name */
  name: string;
  /** Monthly price in MXN */
  price: number;
  /** Max storage in GB */
  storageGB: number;
  /** Stripe intent key (null for free) */
  stripeIntent: string | null;
  /** Features list for pricing cards */
  features: string[];
}

export const PLANS: Record<PlanKey, PlanConfig> = {
  Gratis: {
    name: "Gratis",
    price: 0,
    storageGB: 1,
    stripeIntent: null,
    features: [
      "1 GB de almacenamiento",
      "100 subidas/día",
      "Búsqueda con IA",
      "Acceso MCP",
    ],
  },
  Pro: {
    name: "Pro",
    price: 199,
    storageGB: 50,
    stripeIntent: "pro_plan",
    features: [
      "50 GB de almacenamiento",
      "Subidas ilimitadas",
      "Transformación de imágenes",
      "Proveedores custom",
    ],
  },
  Business: {
    name: "Business",
    price: 499,
    storageGB: 500,
    stripeIntent: "business_plan",
    features: [
      "500 GB de almacenamiento",
      "Soporte prioritario",
      "Retención extendida de papelera",
      "Dominios custom",
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
