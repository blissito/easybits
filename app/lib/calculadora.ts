/**
 * Calculadora "¿cuánto cuesta correr mi agente?" — para el experto que va a
 * operar su agente él mismo. Una sola regla: lo que se enseña es lo que se
 * compra → plan plano + cajas extra + packs que cubren el excedente + hosting.
 * Sin interpolaciones: `computePlanFromCredits` sólo sugiere plan.
 *
 * Puro, sin servidor. Fuentes de precio: plans.ts, credits.ts, hostingCatalog.ts.
 */
import {
  effectivePrice,
  GENERATION_PACKS,
  LLM_TOKEN_PACKS,
  PLANS,
  WEB_PACKS,
  type PlanKey,
} from "./plans";
import {
  computePlanFromCredits,
  COST_DOC,
  COST_IMAGE,
  COST_REEL_HTML,
  COST_VOICE_MINUTE,
  PLAN_CREDITS,
} from "./credits";
import {
  FLEET_BOX,
  HOSTING_CATALOG,
  machineMonthly,
  SELLABLE_TIERS,
  type TierKey,
} from "./hostingCatalog";

/** Consultas web de cortesía al alta (User.webQueriesBonus default). */
export const WEB_FREE_QUERIES = 50;

export type CalcInputs = {
  plan: PlanKey;
  /** Agentes/conversaciones que deben poder correr a la vez. */
  agents: number;
  /** Consultas web al mes (buscar, leer, extraer). */
  webQueries: number;
  /** Documentos generados al mes. */
  docs: number;
  /** Imágenes generadas al mes. */
  images: number;
  /** Reels HTML al mes. */
  reels: number;
  /** Minutos de voz al mes. */
  voiceMinutes: number;
  /** Tokens LLM al mes por el proxy (en millones). */
  llmMillions: number;
  /** Apps hospedadas: tier → cantidad. */
  hosting: Partial<Record<TierKey, number>>;
  /** Storage esperado en GB. */
  storageGb: number;
};

export const DEFAULT_CALC: CalcInputs = {
  plan: "Byte",
  agents: 1,
  webQueries: 50,
  docs: 3,
  images: 0,
  reels: 0,
  voiceMinutes: 0,
  llmMillions: 0,
  hosting: {},
  storageGb: 0,
};

export type CalcLine = {
  key: string;
  label: string;
  /** Detalle humano ("2 cajas × $299", "1 × pack 10K"). */
  detail: string;
  mxn: number;
};

export type CalcResult = {
  plan: PlanKey;
  lines: CalcLine[];
  monthlyMxn: number;
  /** Plan que cubriría el consumo con lo incluido (sugerencia, no precio). */
  suggestedPlan: PlanKey;
  /** Avisos que no se resuelven con dinero (storage sin pack, etc.). */
  notes: string[];
};

type Pack = { id: string; units: number; price: number };

/**
 * Packs que cubren `excess` al menor costo: greedy por $/unidad (el grande
 * primero mientras quepa entero), y el remanente con el pack más barato que
 * lo cubra. Devuelve [{pack, qty}] y el total.
 */
export function cheapestPacks(
  excess: number,
  packs: Pack[],
): { picks: { pack: Pack; qty: number }[]; mxn: number } {
  if (excess <= 0 || packs.length === 0) return { picks: [], mxn: 0 };
  const byUnit = [...packs].sort((a, b) => a.price / a.units - b.price / b.units);
  const picks: { pack: Pack; qty: number }[] = [];
  let left = excess;
  for (const pack of byUnit) {
    const qty = Math.floor(left / pack.units);
    if (qty > 0) {
      picks.push({ pack, qty });
      left -= qty * pack.units;
    }
  }
  if (left > 0) {
    // El pack más barato que cubra el resto; si ninguno lo cubre solo, el
    // más grande tantas veces como haga falta.
    const cover = [...packs].filter((p) => p.units >= left).sort((a, b) => a.price - b.price)[0];
    const chosen = cover ?? byUnit[0];
    const qty = cover ? 1 : Math.ceil(left / chosen.units);
    const existing = picks.find((p) => p.pack.id === chosen.id);
    if (existing) existing.qty += qty;
    else picks.push({ pack: chosen, qty });
  }
  // Si comprar un solo pack grande sale más barato que la combinación, gana.
  const mxn = picks.reduce((a, p) => a + p.pack.price * p.qty, 0);
  const single = packs.filter((p) => p.units >= excess).sort((a, b) => a.price - b.price)[0];
  if (single && single.price < mxn) return { picks: [{ pack: single, qty: 1 }], mxn: single.price };
  return { picks, mxn };
}

const WEB_PACK_LIST: Pack[] = WEB_PACKS.map((p) => ({ id: p.id, units: p.queries, price: p.price }));
const CREDIT_PACK_LIST: Pack[] = GENERATION_PACKS
  .filter((p) => !p.recipe) // los temáticos son cosméticos
  .map((p) => ({ id: p.id, units: p.generations, price: p.promoPrice ?? p.prices.Byte }));
const LLM_PACK_LIST: Pack[] = LLM_TOKEN_PACKS.map((p) => ({ id: p.id, units: p.tokens, price: p.price }));

export function creditsFor(i: CalcInputs): number {
  return i.docs * COST_DOC + i.images * COST_IMAGE + i.reels * COST_REEL_HTML + i.voiceMinutes * COST_VOICE_MINUTE;
}

const fmtPicks = (picks: { pack: Pack; qty: number }[], unit: string) =>
  picks.map((p) => `${p.qty} × pack ${p.pack.units.toLocaleString("es-MX")} ${unit}`).join(" + ");

export function computeRunCost(i: CalcInputs): CalcResult {
  const plan = PLANS[i.plan];
  const lines: CalcLine[] = [];
  const notes: string[] = [];

  // Plan
  lines.push({
    key: "plan",
    label: `Plan ${plan.name}`,
    detail: effectivePrice(i.plan) === 0 ? "gratis" : `${plan.concurrentSandboxes} caja${plan.concurrentSandboxes > 1 ? "s" : ""} · ${plan.storageGB} GB · ${PLAN_CREDITS[i.plan].toLocaleString("es-MX")} cr`,
    mxn: effectivePrice(i.plan),
  });

  // Cajas extra (flota): cada caja corre FLEET_BOX.agents agentes.
  const includedAgents = plan.concurrentSandboxes * FLEET_BOX.agents;
  const extraAgents = Math.max(0, i.agents - includedAgents);
  const boxes = Math.ceil(extraAgents / FLEET_BOX.agents);
  if (boxes > 0) {
    lines.push({
      key: "boxes",
      label: "Cajas extra para agentes",
      detail: `${boxes} × $${FLEET_BOX.priceMxn} (${FLEET_BOX.agents} agentes por caja)`,
      mxn: boxes * FLEET_BOX.priceMxn,
    });
  }

  // Web
  const webExcess = Math.max(0, i.webQueries - WEB_FREE_QUERIES);
  if (webExcess > 0) {
    const r = cheapestPacks(webExcess, WEB_PACK_LIST);
    lines.push({ key: "web", label: "Consultas web", detail: fmtPicks(r.picks, "consultas"), mxn: r.mxn });
  }

  // Créditos de generación
  const credits = creditsFor(i);
  const creditExcess = Math.max(0, credits - PLAN_CREDITS[i.plan]);
  if (creditExcess > 0) {
    const r = cheapestPacks(creditExcess, CREDIT_PACK_LIST);
    lines.push({ key: "credits", label: "Créditos de generación", detail: fmtPicks(r.picks, "cr"), mxn: r.mxn });
  }

  // Tokens LLM
  const tokens = Math.round(i.llmMillions * 1_000_000);
  const tokenExcess = Math.max(0, tokens - plan.llmTokensIncluded);
  if (tokenExcess > 0) {
    const r = cheapestPacks(tokenExcess, LLM_PACK_LIST);
    lines.push({
      key: "llm",
      label: "Tokens LLM",
      detail: r.picks.map((p) => `${p.qty} × pack ${p.pack.units / 1_000_000}M`).join(" + "),
      mxn: r.mxn,
    });
  }

  // Hosting
  for (const key of SELLABLE_TIERS) {
    const n = i.hosting[key] ?? 0;
    if (n <= 0) continue;
    const tier = HOSTING_CATALOG[key];
    lines.push({
      key: `host_${key}`,
      label: `App hospedada · ${key}`,
      detail: `${n} × $${machineMonthly(tier, "shared")} (${tier.vcpus} vCPU · ${tier.memoryMb / 1024} GB)`,
      mxn: n * machineMonthly(tier, "shared"),
    });
  }

  // Storage: no hay pack; sólo aviso.
  if (i.storageGb > plan.storageGB) {
    notes.push(`Tu plan incluye ${plan.storageGB} GB de storage; para ${i.storageGb} GB necesitas un plan mayor.`);
  }

  // Sugerencia de plan: el más barato cuyo storage y cajas cubran, y que
  // computePlanFromCredits no ponga por encima.
  const order: PlanKey[] = ["Byte", "Mega", "Tera"];
  const byCredits = computePlanFromCredits(credits).plan;
  const suggestedPlan =
    order.find(
      (k) =>
        PLANS[k].storageGB >= i.storageGb &&
        PLANS[k].concurrentSandboxes * FLEET_BOX.agents >= Math.min(i.agents, 4) &&
        order.indexOf(k) >= order.indexOf(byCredits),
    ) ?? "Tera";

  return {
    plan: i.plan,
    lines,
    monthlyMxn: lines.reduce((a, l) => a + l.mxn, 0),
    suggestedPlan,
    notes,
  };
}

// ── URL ─────────────────────────────────────────────────────────────────
const KEYS: (keyof Omit<CalcInputs, "plan" | "hosting">)[] = [
  "agents", "webQueries", "docs", "images", "reels", "voiceMinutes", "llmMillions", "storageGb",
];

export function serializeCalc(i: CalcInputs): URLSearchParams {
  const p = new URLSearchParams();
  p.set("plan", i.plan);
  for (const k of KEYS) if (i[k] !== DEFAULT_CALC[k]) p.set(k, String(i[k]));
  const host = Object.entries(i.hosting).filter(([, n]) => (n ?? 0) > 0).map(([k, n]) => `${k}:${n}`).join(",");
  if (host) p.set("host", host);
  return p;
}

export function parseCalc(p: URLSearchParams): CalcInputs {
  const out: CalcInputs = { ...DEFAULT_CALC, hosting: {} };
  const plan = p.get("plan");
  if (plan === "Byte" || plan === "Mega" || plan === "Tera") out.plan = plan;
  for (const k of KEYS) {
    const v = Number(p.get(k));
    if (p.has(k) && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  for (const part of (p.get("host") ?? "").split(",")) {
    const [k, n] = part.split(":");
    if (SELLABLE_TIERS.includes(k as TierKey) && Number(n) > 0) out.hosting[k as TierKey] = Number(n);
  }
  return out;
}
