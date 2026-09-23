/**
 * Oferta de fin de trial para estudiantes (sep 2026): Mega a $149 MXN/mes y una
 * `micro` gratis durante 3 meses (facturas de oct, nov y dic). Enero ya sale a
 * precio normal — el cupón es `repeating` y caduca solo.
 *
 * Dos cupones con id fijo (idempotente, se crean una sola vez):
 *  - STUDENT_MEGA_2026   $350 fuera del total  → Mega $499 → $149 (los trials
 *                        del taller se crearon a precio de lista, no a la promo).
 *  - STUDENT_MICRO_2026  $99 fuera, SOLO sobre productos de hosting → una micro
 *                        gratis. Si el alumno aún no tiene máquina, queda puesto
 *                        y aplica cuando la compre como item del plan.
 *
 * Monto fijo y no porcentaje: el producto del plan se crea al vuelo en cada
 * checkout (`product_data`), así que no se puede acotar con `applies_to`; un
 * porcentaje descontaría también las máquinas que viajan en la misma factura.
 *
 * El SDK de stripe del repo (v13, API 2023-08-16) sólo acepta UN cupón por
 * suscripción. Aquí se habla directo a la API con una versión que acepta
 * `discounts[]`, sin tocar la versión que usa la app.
 *
 * ⚠️ Ningún trial del taller tiene tarjeta y `trial_settings.end_behavior.
 * missing_payment_method = "cancel"`: al vencer, Stripe CANCELA. El cupón sólo
 * sirve si el alumno registra tarjeta antes de su `trial_end` — la columna
 * `tarjeta` lo dice.
 *
 * Run: npx tsx scripts/student-offer.mts            (dry-run: sólo imprime)
 *      npx tsx scripts/student-offer.mts --apply    (crea cupones y los aplica)
 *      --exclude a@x.com,b@y.com                    (cambia las cuentas excluidas)
 */
import "dotenv/config";

const APPLY = process.argv.includes("--apply");
const exArg = process.argv.find((a, i) => process.argv[i - 1] === "--exclude");
const EXCLUDE = new Set(
  (exArg ?? "blissitos@gmail.com,brenda@fixter.org").split(",").map((s) => s.trim().toLowerCase())
);

const MEGA = "STUDENT_MEGA_2026";
const MICRO = "STUDENT_MICRO_2026";
const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) throw new Error("STRIPE_SECRET_KEY no está en el entorno");

// ── cliente mínimo ────────────────────────────────────────────────────────────
function form(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v !== null && typeof v === "object") out.push(...form(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}
async function stripe(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<any> {
  const qs = method === "GET" && body ? `?${form(body).join("&")}` : "";
  const res = await fetch(`https://api.stripe.com/v1${path}${qs}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Stripe-Version": "2025-03-31.basil",
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" && body ? form(body).join("&") : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    const e: any = new Error(`${method} ${path}: ${json?.error?.message ?? res.status}`);
    e.code = json?.error?.code;
    throw e;
  }
  return json;
}
async function listAll(path: string, params: Record<string, unknown>): Promise<any[]> {
  const out: any[] = [];
  let starting_after: string | undefined;
  for (;;) {
    const page = await stripe("GET", path, { limit: 100, ...params, starting_after });
    out.push(...page.data);
    if (!page.has_more) return out;
    starting_after = page.data.at(-1).id;
  }
}
const mxn = (c: number) => `$${(c / 100).toFixed(2)}`;

// ── 1. Productos de hosting (pueden ser varios: hubo duplicados antes de ago-2026) ──
const hosting = await stripe("GET", "/products/search", {
  query: `metadata['eb_kind']:'hosting'`,
  limit: 100,
});
const hostingIds: string[] = hosting.data.map((p: any) => p.id);
if (process.env.EB_HOSTING_PRODUCT_ID && !hostingIds.includes(process.env.EB_HOSTING_PRODUCT_ID))
  hostingIds.push(process.env.EB_HOSTING_PRODUCT_ID);
if (!hostingIds.length) throw new Error("No encontré el producto de hosting en Stripe");

// ── 2. Trials de EasyBits (misma regla que trial-usage.mts: metadata.plan) ─────
const allTrials = (await listAll("/subscriptions", { status: "trialing", "expand[0]": "data.customer" }))
  .filter((s) => s.metadata?.plan && s.trial_end);
// Un cliente con DOS trials vivos (pasó) se cobraría doble al vencer: el
// descuento va a la que vence más tarde y la otra se reporta para cancelarla.
const byCustomer = new Map<string, any>();
const duplicates: any[] = [];
for (const s of allTrials) {
  // Por email, no por customer: el mismo alumno puede tener dos customers.
  const c = String(s.customer?.email ?? "").toLowerCase() || s.customer?.id || s.customer;
  const prev = byCustomer.get(c);
  if (!prev) byCustomer.set(c, s);
  else if (s.trial_end > prev.trial_end) { duplicates.push(prev); byCustomer.set(c, s); }
  else duplicates.push(s);
}
const subs = [...byCustomer.values()];

type Row = {
  email: string;
  sub: string;
  trialEnd: string;
  planSub: string;
  microSub: string;
  descuentos: string;
  tarjeta: string;
  estado: string;
};
const rows: Row[] = [];
const todo: { planSub: string; microSub: string; email: string }[] = [];

for (const s of subs) {
  const email = String(s.customer?.email ?? "").toLowerCase();
  if (EXCLUDE.has(email)) continue;
  const customer = typeof s.customer === "string" ? s.customer : s.customer.id;

  // La micro gratis va UNA vez por alumno: si ya tiene una máquina con su propia
  // suscripción, el cupón de hosting va ahí; si no, va en la del plan (donde
  // caerá la máquina que compre).
  const machineSubs = (await listAll("/subscriptions", { customer, status: "all" })).filter(
    (m) => m.metadata?.eb_machine && (m.status === "active" || m.status === "trialing")
  );
  const microSub = machineSubs[0]?.id ?? s.id;

  const pms = await stripe("GET", "/payment_methods", { customer, limit: 1 });
  const current = (s.discounts ?? []).map((d: any) => (typeof d === "string" ? d : d.coupon?.id ?? d.id));
  rows.push({
    email,
    sub: s.id,
    trialEnd: new Date(s.trial_end * 1000).toISOString().slice(0, 10),
    planSub: s.metadata.plan,
    microSub: microSub === s.id ? "misma" : microSub,
    descuentos: current.length ? String(current.length) : "—",
    tarjeta: pms.data.length ? "sí" : "NO",
    estado: "",
  });
  todo.push({ planSub: s.id, microSub, email });
}

console.table(rows);
console.log(`\n${todo.length} alumnos · hosting: ${hostingIds.join(", ")}`);
for (const d of duplicates)
  console.log(`⚠️  TRIAL DUPLICADO ${d.customer?.email} ${d.id} (vence ${new Date(d.trial_end * 1000).toISOString().slice(0, 10)}): se cobraría doble. Cancélalo a mano.`);
if (!APPLY) {
  console.log("\nDry-run. Corre con --apply para crear los cupones y aplicarlos.");
  process.exit(0);
}

// ── 3. Cupones (idempotente por id) ─────────────────────────────────────────
async function ensureCoupon(id: string, body: Record<string, unknown>) {
  try {
    return await stripe("GET", `/coupons/${id}`);
  } catch (e: any) {
    if (e.code !== "resource_missing") throw e;
    return stripe("POST", "/coupons", { id, ...body });
  }
}
await ensureCoupon(MEGA, {
  name: "Estudiantes: Mega $149",
  amount_off: 35000,
  currency: "mxn",
  duration: "repeating",
  duration_in_months: 3,
});
await ensureCoupon(MICRO, {
  name: "Estudiantes: micro incluida",
  amount_off: 9900,
  currency: "mxn",
  duration: "repeating",
  duration_in_months: 3,
  applies_to: { products: Object.fromEntries(hostingIds.map((p, i) => [i, p])) },
});

// ── 4. Aplicar sin tocar trial ni precio ──────────────────────────────────────
// `discounts` REEMPLAZA la lista: se conservan los que ya tenía (sin duplicar).
async function addDiscounts(subId: string, coupons: string[]) {
  const sub = await stripe("GET", `/subscriptions/${subId}`, { "expand[0]": "discounts" });
  const kept = (sub.discounts ?? [])
    .map((d: any) => (typeof d === "string" ? { discount: d } : { discount: d.id, coupon: d.coupon?.id }))
    .filter((d: any) => !coupons.includes(d.coupon));
  const list = [...kept.map((d: any) => ({ discount: d.discount })), ...coupons.map((c) => ({ coupon: c }))];
  await stripe("POST", `/subscriptions/${subId}`, {
    discounts: Object.fromEntries(list.map((d, i) => [i, d])),
    proration_behavior: "none",
  });
}

for (const t of todo) {
  const row = rows.find((r) => r.sub === t.planSub)!;
  try {
    if (t.microSub === t.planSub) await addDiscounts(t.planSub, [MEGA, MICRO]);
    else {
      await addDiscounts(t.planSub, [MEGA]);
      await addDiscounts(t.microSub, [MICRO]);
    }
    const preview = await stripe("POST", "/invoices/create_preview", { subscription: t.planSub });
    row.estado = `ok · próxima ${mxn(preview.total)}`;
  } catch (e: any) {
    row.estado = `ERROR ${e.message}`;
  }
}
console.table(rows.map(({ email, trialEnd, estado }) => ({ email, trialEnd, estado })));
