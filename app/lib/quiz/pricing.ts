import {
  CAPABILITIES,
  CUSTOM_INTEGRATIONS_DISCOVERY_MXN,
  CUSTOM_INTEGRATIONS_FROM_MXN,
  ORCHESTRATION_FEE_MXN,
  SETUP_FEE_MXN,
  SETUP_FEE_USD,
  type Capability,
} from "./capabilities";

export type QuoteLine = {
  capability: Capability;
  priceMxn: number;
};

export type Quote = {
  // Setup único, no reembolsable, anclaje del modelo directo.
  setupOneTimeMxn: number;
  setupOneTimeUsd: number;
  // Recurrente mensual = orquestación + capabilities seleccionadas.
  monthlyTotalMxn: number;
  orchestrationFeeMxn: number;
  capsTotalMxn: number;
  // Integraciones custom: "desde" + discovery (ambos one-time, fuera del mensual).
  customIntegrationsFromMxn: number;
  customIntegrationsDiscoveryMxn: number;
  hasCustomIntegrations: boolean;
  breakdown: QuoteLine[];
  selectionsCount: number;
};

export const computeQuote = (
  selectedIds: string[],
  hasCustomIntegrations = false
): Quote => {
  const ids = new Set(selectedIds);
  const breakdown = CAPABILITIES.filter((c) => ids.has(c.id)).map((c) => ({
    capability: c,
    priceMxn: c.basePriceMxn,
  }));

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
