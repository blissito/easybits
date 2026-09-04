import { describe, it, expect } from "vitest";
import { cheapestPacks, computeRunCost, DEFAULT_CALC, parseCalc, serializeCalc } from "../app/lib/calculadora";

const WEB = [{ id: "web_400", units: 400, price: 99 }, { id: "web_10000", units: 10000, price: 999 }];

describe("cheapestPacks", () => {
  it("0 → nada", () => expect(cheapestPacks(0, WEB)).toEqual({ picks: [], mxn: 0 }));
  it("350 → un pack de 400", () => expect(cheapestPacks(350, WEB).mxn).toBe(99));
  it("4,500 → un 10K sale más barato que 12 × 400", () => expect(cheapestPacks(4500, WEB).mxn).toBe(999));
  it("10,400 → 10K + 400", () => expect(cheapestPacks(10400, WEB).mxn).toBe(1098));
});

describe("computeRunCost", () => {
  it("hobby: Byte, 1 agente, 50 consultas → $0", () => {
    const r = computeRunCost(DEFAULT_CALC);
    expect(r.monthlyMxn).toBe(0);
    expect(r.lines.map((l) => l.key)).toEqual(["plan"]);
  });
  it("agencia: Mega, 12 agentes, 3,000 consultas, 40 docs, 20M tokens", () => {
    const r = computeRunCost({ ...DEFAULT_CALC, plan: "Mega", agents: 12, webQueries: 3000, docs: 40, llmMillions: 20 });
    const by = Object.fromEntries(r.lines.map((l) => [l.key, l.mxn]));
    expect(by.plan).toBe(299); // promo
    expect(by.boxes).toBe(299); // 12 agentes − 8 incluidos = 1 caja
    expect(by.web).toBe(792); // 2,950 → 8 × 400 ($792) le gana al de 10K ($999)
    expect(by.credits).toBeUndefined(); // 4,000 cr < 10,000 incluidos
    expect(by.llm).toBe(549); // 20M − 10M = 10M → pack 10M
    expect(r.monthlyMxn).toBe(299 + 299 + 792 + 549);
  });
  it("producción: Tera con 2 apps estandar y storage que no cabe avisa", () => {
    const r = computeRunCost({ ...DEFAULT_CALC, plan: "Tera", hosting: { estandar: 2 }, storageGb: 500 });
    expect(r.lines.find((l) => l.key === "host_estandar")?.mxn).toBe(898);
    expect(r.notes[0]).toMatch(/100 GB/);
  });
  it("sugiere Mega cuando el storage no cabe en Byte", () => {
    expect(computeRunCost({ ...DEFAULT_CALC, storageGb: 5 }).suggestedPlan).toBe("Mega");
  });
});

describe("URL", () => {
  it("round-trip", () => {
    const i = { ...DEFAULT_CALC, plan: "Mega" as const, agents: 9, webQueries: 1200, hosting: { micro: 2 } };
    expect(parseCalc(serializeCalc(i))).toEqual(i);
  });
});
