import {
  CAPABILITIES,
  CUSTOM_INTEGRATIONS_DISCOVERY_MXN,
  CUSTOM_INTEGRATIONS_FROM_MXN,
  DEFAULT_TIER_ID,
  ORCHESTRATION_FEE_MXN,
  SETUP_FEE_MXN,
  SETUP_FEE_USD,
  type Capability,
  type CapabilityCap,
  type Tier,
} from "./capabilities";

// Selecciones del usuario: capabilityId → tierId.
// Para capabilities binarias el tierId es DEFAULT_TIER_ID.
// Para capabilities con tiers, tierId es "basic" | "pro" | etc.
export type Selections = Map<string, string>;

export type QuoteLine = {
  capability: Capability;
  priceMxn: number;
  tierId: string;
  tierLabel?: string; // solo presente si la capability tiene tiers
  cap?: CapabilityCap; // cap aplicable (del tier seleccionado, o del capability si no tiene tiers)
};

export type Quote = {
  setupOneTimeMxn: number;
  setupOneTimeUsd: number;
  monthlyTotalMxn: number;
  orchestrationFeeMxn: number;
  capsTotalMxn: number;
  customIntegrationsFromMxn: number;
  customIntegrationsDiscoveryMxn: number;
  hasCustomIntegrations: boolean;
  breakdown: QuoteLine[];
  selectionsCount: number;
};

// Resuelve el tier seleccionado de un capability. Si no tiene tiers, devuelve null.
const resolveTier = (
  capability: Capability,
  tierId: string
): Tier | null => {
  if (!capability.tiers) return null;
  return capability.tiers.find((t) => t.id === tierId) ?? capability.tiers[0];
};

export const computeQuote = (
  selections: Selections,
  hasCustomIntegrations = false
): Quote => {
  const breakdown: QuoteLine[] = [];

  for (const cap of CAPABILITIES) {
    const tierId = selections.get(cap.id);
    if (!tierId) continue;

    const tier = resolveTier(cap, tierId);
    if (tier) {
      breakdown.push({
        capability: cap,
        priceMxn: tier.priceMxn,
        tierId: tier.id,
        tierLabel: tier.label,
        cap: tier.cap,
      });
    } else {
      // Capability binaria: usa basePriceMxn y cap directo
      breakdown.push({
        capability: cap,
        priceMxn: cap.basePriceMxn,
        tierId: DEFAULT_TIER_ID,
        cap: cap.cap,
      });
    }
  }

  const capsTotalMxn = breakdown.reduce((acc, b) => acc + b.priceMxn, 0);
  const monthlyTotalMxn = ORCHESTRATION_FEE_MXN + capsTotalMxn;

  return {
    setupOneTimeMxn: SETUP_FEE_MXN,
    setupOneTimeUsd: SETUP_FEE_USD,
    monthlyTotalMxn,
    orchestrationFeeMxn: ORCHESTRATION_FEE_MXN,
    capsTotalMxn,
    customIntegrationsFromMxn: hasCustomIntegrations
      ? CUSTOM_INTEGRATIONS_FROM_MXN
      : 0,
    customIntegrationsDiscoveryMxn: hasCustomIntegrations
      ? CUSTOM_INTEGRATIONS_DISCOVERY_MXN
      : 0,
    hasCustomIntegrations,
    breakdown,
    selectionsCount: breakdown.length,
  };
};

// Serializa selecciones para URL: "voice:pro,images,whatsapp,memory".
// Capabilities binarias (tierId === DEFAULT_TIER_ID) van sin sufijo.
export const serializeSelections = (selections: Selections): string =>
  Array.from(selections.entries())
    .map(([capId, tierId]) =>
      tierId === DEFAULT_TIER_ID ? capId : `${capId}:${tierId}`
    )
    .join(",");

// Parsea selecciones desde URL.
export const parseSelections = (str: string): Selections => {
  const result: Selections = new Map();
  const validIds = new Set(CAPABILITIES.map((c) => c.id));
  for (const entry of str.split(",")) {
    const [capId, tierId] = entry.trim().split(":");
    if (!capId || !validIds.has(capId)) continue;
    result.set(capId, tierId || DEFAULT_TIER_ID);
  }
  return result;
};

export const formatMxn = (amount: number): string =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

export const formatUsd = (amount: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

// Descuento permanente al presentar la cotización. Aplica SOLO al mensual
// (el setup nunca se descuenta). Fuente única usada por UI, PDF y Stripe checkout.
export const QUOTE_DISCOUNT_PCT = 20;

export const computeDiscountedMonthly = (monthlyTotalMxn: number): number =>
  Math.round(monthlyTotalMxn * (1 - QUOTE_DISCOUNT_PCT / 100));
