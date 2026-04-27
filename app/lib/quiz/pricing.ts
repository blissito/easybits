import {
  CAPABILITIES,
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
  breakdown: QuoteLine[];
  selectionsCount: number;
};

export const computeQuote = (selectedIds: string[]): Quote => {
  const ids = new Set(selectedIds);
  const breakdown = CAPABILITIES.filter((c) => ids.has(c.id)).map((c) => ({
    capability: c,
    priceMxn: c.basePriceMxn,
  }));

  const capsTotalMxn = breakdown.reduce((acc, b) => acc + b.priceMxn, 0);

  return {
    orchestrationFeeMxn: ORCHESTRATION_FEE_MXN,
    capsTotalMxn,
    totalMxn: ORCHESTRATION_FEE_MXN + capsTotalMxn,
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
