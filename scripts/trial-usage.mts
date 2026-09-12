/**
 * Uso de los TRIALS: tokens LLM, recursos creados por familia de tools y cajas.
 *
 * "Trial" = suscripción de Stripe con status `trialing` y `metadata.plan`
 * (la cuenta de Stripe sirve a varias apps; sin ese filtro salen otros productos).
 * Con `--all-trials` incluye también trials ya vencidos/cancelados (status
 * cualquiera, `trial_end` presente).
 *
 * No existe un log por llamada de tool, así que "uso de tools" se mide por los
 * RECURSOS que dejaron: archivos, docs, DBs, sitios, agentes, jobs web, videos.
 *
 * Run: npx tsx scripts/trial-usage.mts [--all-trials]
 */
import { db } from "../app/.server/db";
import { getStripe } from "../app/.server/stripe";
import { computeRealCostUsd, LLM_PROXY_DEFAULTS } from "../app/lib/credits";

const allTrials = process.argv.includes("--all-trials");
const stripe = getStripe();
const MXN = LLM_PROXY_DEFAULTS.usdToMxn;

// ── 1. Trials en Stripe ───────────────────────────────────────────────────────
type Trial = { customer: string; plan: string; status: string; trialEnd: Date; email?: string };
const trials: Trial[] = [];
for await (const s of stripe.subscriptions.list({ status: allTrials ? "all" : "trialing", limit: 100, expand: ["data.customer"] })) {
  if (!s.metadata?.plan || !s.trial_end) continue;
  const c = s.customer as any;
  trials.push({ customer: typeof c === "string" ? c : c.id, plan: s.metadata.plan, status: s.status, trialEnd: new Date(s.trial_end * 1000), email: c?.email });
}
// Un customer con dos suscripciones en trial (pasó): una fila, la que vence más tarde.
const byCustomer = new Map<string, Trial>();
for (const t of trials) { const p = byCustomer.get(t.customer); if (!p || t.trialEnd > p.trialEnd) byCustomer.set(t.customer, t); }
trials.length = 0; trials.push(...byCustomer.values());
const customerIds = trials.map((t) => t.customer);
const users = await db.user.findMany({
  where: { OR: [{ stripeId: { in: customerIds } }, { stripeIds: { hasSome: customerIds } }, { email: { in: trials.map((t) => t.email).filter(Boolean) as string[] } }] },
  select: { id: true, email: true, stripeId: true, stripeIds: true, llmTokensUsed: true, llmTokensBonus: true, createdAt: true },
});
const userOf = (t: Trial) =>
  users.find((u) => u.stripeId === t.customer || u.stripeIds.includes(t.customer)) ?? users.find((u) => u.email === t.email);

const ids = users.map((u) => u.id);
const cnt = (p: Promise<{ userId?: string; ownerId?: string }[]>) =>
  p.then((rows) => { const m = new Map<string, number>(); for (const r of rows) { const k = (r.userId ?? r.ownerId)!; m.set(k, (m.get(k) ?? 0) + 1); } return m; });

// ── 2. Recursos por familia de tools ─────────────────────────────────────────
const [files, docs, dbs, sites, agents, webJobs, videos, keys] = await Promise.all([
  cnt(db.file.findMany({ where: { ownerId: { in: ids }, status: { not: "DELETED" } }, select: { ownerId: true } })),
  cnt(db.landing.findMany({ where: { ownerId: { in: ids } }, select: { ownerId: true } })),
  cnt(db.database.findMany({ where: { userId: { in: ids } }, select: { userId: true } })),
  cnt(db.website.findMany({ where: { ownerId: { in: ids }, deletedAt: null }, select: { ownerId: true } })),
  cnt(db.fleetAgent.findMany({ where: { ownerId: { in: ids } }, select: { ownerId: true } })),
  cnt(db.webJob.findMany({ where: { userId: { in: ids } }, select: { userId: true } })),
  cnt(db.videoProject.findMany({ where: { ownerId: { in: ids } }, select: { ownerId: true } })),
  db.apiKey.findMany({ where: { userId: { in: ids } }, select: { userId: true, lastUsedAt: true } }),
]);
const lastKeyUse = new Map<string, Date>();
for (const k of keys) if (k.lastUsedAt && (!lastKeyUse.has(k.userId) || k.lastUsedAt > lastKeyUse.get(k.userId)!)) lastKeyUse.set(k.userId, k.lastUsedAt);

// ── 3. Cajas: sesiones (efímeras+permanentes) y permanentes vivas ───────────
const sessions = await db.sandboxSession.findMany({ where: { ownerId: { in: ids } }, select: { ownerId: true, startedAt: true, endedAt: true, endReason: true, runningMs: true, state: true, lastStateAt: true } });
// Horas: sólo de sesiones con cierre OBSERVADO (destroy/reconciled) o abiertas.
// Las "stale" (cerradas por edad, sin señal) llevan un runningMs inventado
// (now - startedAt) — se cuentan como sesión pero no suman horas.
const box = new Map<string, { sessions: number; hours: number; open: number; stale: number }>();
const now = Date.now();
for (const s of sessions) {
  const r = box.get(s.ownerId) ?? { sessions: 0, hours: 0, open: 0, stale: 0 };
  r.sessions++;
  if (s.endReason === "stale") { r.stale++; box.set(s.ownerId, r); continue; }
  let ms = s.runningMs;
  if (!s.endedAt) { r.open++; if (s.state === "running") ms += now - s.lastStateAt.getTime(); }
  r.hours += ms / 3.6e6; box.set(s.ownerId, r);
}
const perm = await db.sandbox.findMany({ where: { ownerId: { in: ids }, status: { notIn: ["destroyed"] } }, select: { ownerId: true, tier: true, status: true } });
const permOf = new Map<string, string[]>();
for (const p of perm) permOf.set(p.ownerId, [...(permOf.get(p.ownerId) ?? []), `${p.tier}:${p.status}`]);

// ── 4. Tokens (AiGenerationLog) ──────────────────────────────────────────────
const logs = await db.aiGenerationLog.findMany({ where: { userId: { in: ids } }, select: { userId: true, product: true, inputTokens: true, outputTokens: true, cachedInputTokens: true, realCostUsd: true, fleetAgentId: true } });
const tok = new Map<string, { calls: number; tokens: number; usd: number; products: Map<string, number>; fleetCalls: number }>();
for (const l of logs) {
  const r = tok.get(l.userId) ?? { calls: 0, tokens: 0, usd: 0, products: new Map(), fleetCalls: 0 };
  const i = l.inputTokens ?? 0, o = l.outputTokens ?? 0, c = l.cachedInputTokens ?? 0;
  r.calls++; r.tokens += i + o; r.usd += l.realCostUsd ?? computeRealCostUsd(i, o, c);
  if (l.fleetAgentId) r.fleetCalls++;
  r.products.set(l.product, (r.products.get(l.product) ?? 0) + 1);
  tok.set(l.userId, r);
}

// ── 5. Tabla ─────────────────────────────────────────────────────────────────
const fmtDate = (d?: Date | null) => d ? d.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short" }) : "—";
// Mismo user con dos customers de Stripe (pasó): una fila.
const seenUser = new Set<string>();
const rows = trials.filter((t) => { const u = userOf(t); if (!u) return true; if (seenUser.has(u.id)) return false; seenUser.add(u.id); return true; }).map((t) => {
  const u = userOf(t);
  if (!u) return { email: t.email ?? t.customer, plan: t.plan, status: t.status, cuenta: "SIN USER" };
  const k = tok.get(u.id); const b = box.get(u.id);
  const tools = [
    files.get(u.id) && `files ${files.get(u.id)}`, docs.get(u.id) && `docs ${docs.get(u.id)}`, dbs.get(u.id) && `db ${dbs.get(u.id)}`,
    sites.get(u.id) && `sites ${sites.get(u.id)}`, agents.get(u.id) && `agentes ${agents.get(u.id)}`, webJobs.get(u.id) && `web ${webJobs.get(u.id)}`, videos.get(u.id) && `video ${videos.get(u.id)}`,
  ].filter(Boolean).join(" · ") || "—";
  return {
    email: u.email, plan: t.plan, status: t.status, fin: fmtDate(t.trialEnd),
    "llave usada": fmtDate(lastKeyUse.get(u.id)),
    tools,
    "LLM calls": k?.calls ?? 0, "flota": k?.fleetCalls ?? 0,
    "tok M": Number(((k?.tokens ?? 0) / 1e6).toFixed(2)), "bucket M": Number((u.llmTokensUsed / 1e6).toFixed(2)),
    "costo MXN": Number(((k?.usd ?? 0) * MXN).toFixed(2)),
    "cajas ses": b?.sessions ?? 0, "sin señal": b?.stale ?? 0, "cajas h": Number((b?.hours ?? 0).toFixed(1)), "vivas": b?.open ?? 0,
    perm: (() => { const p = permOf.get(u.id); if (!p) return "—"; const m = new Map<string, number>(); for (const x of p) m.set(x, (m.get(x) ?? 0) + 1); return [...m].map(([k, n]) => n > 1 ? `${k}×${n}` : k).join(" "); })(),
  };
}).sort((a: any, b: any) => (b["costo MXN"] ?? 0) - (a["costo MXN"] ?? 0));
console.table(rows);
const sum = (k: string) => rows.reduce((s: number, r: any) => s + (r[k] ?? 0), 0);
console.log(`\nTrials: ${rows.length} (${rows.filter((r: any) => r.cuenta !== "SIN USER").length} con user) · LLM calls ${sum("LLM calls")} · ${sum("tok M").toFixed(1)}M tok · $${sum("costo MXN").toFixed(2)} MXN costo real · cajas ${sum("cajas ses")} ses / ${sum("cajas h").toFixed(1)} h`);
process.exit(0);
