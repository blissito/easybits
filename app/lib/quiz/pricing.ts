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
  humanLine?: string; // frase humana del tier (si aplica)
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
        humanLine: tier.humanLine,
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

// Serializa selecciones para URL: "voice_pro,images,whatsapp,memory".
// Capabilities binarias (tierId === DEFAULT_TIER_ID) van sin sufijo.
// Usamos "_" en vez de ":" porque algunos proxies/routers tratan ":" raw como
// reserved (host:port semantics) y devuelven 404.
const TIER_SEPARATOR = "_";

export const serializeSelections = (selections: Selections): string =>
  Array.from(selections.entries())
    .map(([capId, tierId]) =>
      tierId === DEFAULT_TIER_ID ? capId : `${capId}${TIER_SEPARATOR}${tierId}`
    )
    .join(",");

// Parsea selecciones desde URL. Acepta tanto el formato actual ("voice_pro")
// como el legacy con dos puntos ("voice:pro") por si algún link viejo sigue
// rondando.
export const parseSelections = (str: string): Selections => {
  const result: Selections = new Map();
  const validIds = new Set(CAPABILITIES.map((c) => c.id));
  for (const rawEntry of str.split(",")) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    // Try new separator first, fall back to legacy ":".
    const sepIdx =
      entry.indexOf(TIER_SEPARATOR) >= 0
        ? entry.indexOf(TIER_SEPARATOR)
        : entry.indexOf(":");
    const capId = sepIdx >= 0 ? entry.slice(0, sepIdx) : entry;
    const tierId =
      sepIdx >= 0 ? entry.slice(sepIdx + 1) || DEFAULT_TIER_ID : DEFAULT_TIER_ID;
    if (!validIds.has(capId)) continue;
    result.set(capId, tierId);
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
