import {
  CAPABILITIES,
  CUSTOM_INTEGRATIONS_MXN,
  ORCHESTRATION_FEE_MXN,
  type Capability,
} from "./capabilities";

export type QuoteLine = {
  capability: Capability;
  priceMxn: number;
};

export type Quote = {
  totalMxn: number;
  orchestrationFeeMxn: number;
  capsTotalMxn: number;
  customIntegrationsMxn: number;
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
  const customIntegrationsMxn = hasCustomIntegrations
    ? CUSTOM_INTEGRATIONS_MXN
    : 0;

  return {
    orchestrationFeeMxn: ORCHESTRATION_FEE_MXN,
    capsTotalMxn,
    customIntegrationsMxn,
    hasCustomIntegrations,
    totalMxn: ORCHESTRATION_FEE_MXN + capsTotalMxn + customIntegrationsMxn,
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
