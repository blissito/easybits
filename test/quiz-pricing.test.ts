import { describe, it, expect } from "vitest";
import { computeQuote, computeSetupEffective, SETUP_BASE_MXN, CUSTOM_INTEGRATIONS_SETUP_BUMP_MXN } from "../app/lib/quiz/pricing";
import { CAPABILITIES } from "../app/lib/quiz/capabilities";
import { effectivePrice } from "../app/lib/plans";

const price = (id: string) => CAPABILITIES.find((c) => c.id === id)!.basePriceMxn;
const sel = (...ids: string[]) => new Map(ids.map((id) => [id, "default"]));

describe("computeQuote — una sola fórmula", () => {
  it("setup = base + Σ capacidades; NO se duplica en la mensualidad", () => {
    const q = computeQuote(sel("whatsapp", "memory", "web"), false, "Mega");
    const caps = price("whatsapp") + price("memory") + price("web");
    expect(q.capsTotalMxn).toBe(caps);
    expect(q.setupOneTimeMxn).toBe(SETUP_BASE_MXN + caps);
    expect(q.setupOneTimeMxn).toBe(computeSetupEffective(caps, false));
    expect(q.monthlyTotalMxn).toBe(effectivePrice("Mega"));
  });
  it("integraciones custom suman el bump al setup, no al mes", () => {
    const q = computeQuote(sel("whatsapp"), true, "Tera");
    expect(q.setupOneTimeMxn).toBe(SETUP_BASE_MXN + price("whatsapp") + CUSTOM_INTEGRATIONS_SETUP_BUMP_MXN);
    expect(q.monthlyTotalMxn).toBe(effectivePrice("Tera"));
  });
  it("Byte es gratis al mes", () => {
    expect(computeQuote(sel("memory"), false, "Byte").monthlyTotalMxn).toBe(0);
  });
  it("los add-ons no cuentan como capacidades", () => {
    expect(computeQuote(sel("whatsapp", "web"), false).selectionsCount).toBe(1);
  });
});
