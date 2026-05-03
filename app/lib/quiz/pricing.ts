import {
  CAPABILITIES,
  CUSTOM_INTEGRATIONS_DISCOVERY_MXN,
  CUSTOM_INTEGRATIONS_FROM_MXN,
  DEFAULT_TIER_ID,
  ORCHESTRATION_FEE_MXN,
  SETUP_TIERS_MXN,
  type Capability,
  type CapabilityCap,
  type Tier,
} from "./capabilities";

// Setup escala según cuántas capacidades se seleccionan.
// Usar tu propia función para mapear count → MXN. Esto se llama desde
// computeQuote y desde Stripe checkout para validar que el monto cobrado
// coincida con la cotización del cliente.
export const computeSetupMxn = (selectionsCount: number): number => {
  if (selectionsCount <= 2) return SETUP_TIERS_MXN.minimal;
  if (selectionsCount <= 5) return SETUP_TIERS_MXN.basic;
  if (selectionsCount <= 8) return SETUP_TIERS_MXN.pro;
  return SETUP_TIERS_MXN.full;
};

// Conversión MXN → USD aproximada para mostrar referencia. ~17 MXN/USD.
const MXN_TO_USD_RATE = 17;
const setupUsdFromMxn = (mxn: number): number =>
  Math.round(mxn / MXN_TO_USD_RATE / 100) * 100;

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
    // Caps marcadas comingSoon NO entran al breakdown ni suman al setup,
    // aunque alguien las haya forzado vía URL hydration o estado legacy.
    if (cap.comingSoon) continue;
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
  // Add-ons (babysit, etc.) NO cuentan como "capacidades del agente": son
  // servicios paralelos. Excluirlos de selectionsCount mantiene correcta la
  // copy ("X capacidades"), el tier de setup y la elegibilidad anual.
  const capabilitiesCount = breakdown.filter(
    (b) => !b.capability.isAddon
  ).length;
  const setupOneTimeMxn = computeSetupMxn(capabilitiesCount);

  return {
    setupOneTimeMxn,
    setupOneTimeUsd: setupUsdFromMxn(setupOneTimeMxn),
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
    selectionsCount: capabilitiesCount,
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

// Setup base — piso del setup. Cubre infraestructura, branding, prompts,
// MCPs base, hosting 24/7, babysit del agente y los 30 días de acompañamiento por WhatsApp.
// Cada capability seleccionada suma su `basePriceMxn` one-time encima.
// Custom integrations bumpea otros +$10K. El total es dinámico — recalcula
// en vivo cuando el usuario agrega o quita caps en el summary.
export const SETUP_BASE_MXN = 39000;

// Alias retro-compat — algunos callers (whatsapp message, metadata) siguen
// importando este nombre. Apunta al nuevo base. Si quieres el setup
// efectivo (con caps + integraciones), usa `computeSetupEffective`.
export const SETUP_FLAT_MXN = SETUP_BASE_MXN;

// Bump al setup cuando el cliente trae integraciones custom (CRM/ERP/sistemas
// internos). Es un cargo único que se suma al setup base + caps.
export const CUSTOM_INTEGRATIONS_SETUP_BUMP_MXN = 10000;

// Setup efectivo = base + suma de capabilities seleccionadas + bump opcional
// por integraciones. Pasa `quote.capsTotalMxn` para incluir el costo de las
// caps. Si llamas con 0 obtienes el piso ($39K, sin integraciones).
export const computeSetupEffective = (
  capsTotalMxn: number,
  hasCustomIntegrations: boolean
): number =>
  SETUP_BASE_MXN +
  capsTotalMxn +
  (hasCustomIntegrations ? CUSTOM_INTEGRATIONS_SETUP_BUMP_MXN : 0);

// Babysit opcional: humano que vigila el agente, ajusta prompts, da soporte.
// Se cobra como add-on mensual al plan de créditos elegido. Reutiliza la
// constante histórica de orquestación para no duplicar el número.
export const BABYSIT_MONTHLY_MXN = 3000;

// Descuento natural por pago anual (≈ 2 meses gratis). Aplica solo a
// planes Mega/Tera — Byte es gratis y no tiene anual.
export const ANNUAL_DISCOUNT_PCT = 17;

export const computeAnnualFromMonthly = (monthlyMxn: number): number =>
  Math.round(monthlyMxn * 12 * (1 - ANNUAL_DISCOUNT_PCT / 100));

// LEGACY — se mantienen exports para no romper imports existentes (PDF,
// emails, scripts) hasta que el modelo de "renta + 20% off" desaparezca
// del todo. La nueva pantalla NO debería usarlos.
export const QUOTE_DISCOUNT_PCT = 20;

export const computeDiscountedMonthly = (monthlyTotalMxn: number): number =>
  Math.round(monthlyTotalMxn * (1 - QUOTE_DISCOUNT_PCT / 100));

// Plan anual: paga 12 meses upfront → setup gratis. Solo elegible desde tier
// basic (3+ capacidades) — en minimal (1-2 caps) los 12 meses apenas pagan
// el setup que regalamos. La mensualidad mantiene el 20% off (sin descuento
// adicional por anual — el premio es el setup gratis).
export const ANNUAL_PLAN_MIN_SELECTIONS = 3;

export const isAnnualPlanEligible = (selectionsCount: number): boolean =>
  selectionsCount >= ANNUAL_PLAN_MIN_SELECTIONS;

export type BillingMode = "monthly" | "annual";

export type AnnualPlan = {
  eligible: boolean;
  // Mensualidad equivalente (igual que la mensual con descuento — sin descuento
  // extra por anual). Útil para mostrar "$X/mes pagados anualmente".
  monthlyEquivMxn: number;
  // Total que cobramos en una sola charge anual.
  totalAnnualMxn: number;
  // Lo que el usuario AHORRA al elegir anual: el setup que ya no paga.
  setupSavingsMxn: number;
};

export const computeAnnualPlan = (
  monthlyTotalMxn: number,
  setupOneTimeMxn: number,
  selectionsCount: number
): AnnualPlan => {
  const monthlyEquivMxn = computeDiscountedMonthly(monthlyTotalMxn);
  return {
    eligible: isAnnualPlanEligible(selectionsCount),
    monthlyEquivMxn,
    totalAnnualMxn: monthlyEquivMxn * 12,
    setupSavingsMxn: setupOneTimeMxn,
  };
};
