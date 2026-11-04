/**
 * Hosting por cotización: una agencia CEDE sus máquinas a un cliente a un precio acordado.
 *
 * Flujo: la agencia monta, hace demo y publica en su cuenta (cortesía) → crea la oferta con el
 * correo del cliente y el total al mes → el cliente entra a /dash/hosting, ve la oferta y paga →
 * el webhook (eb_offer_id) le traspasa las máquinas, les pega la suscripción y deja a la agencia
 * como staff (delegación "machines": opera, no cobra ni borra).
 *
 * Cobro: el primer pago es el mes en curso completo, sin prorrateo (el servicio ya lo recibe), y
 * la suscripción se renueva cada día 1.
 *
 * Mientras no pague, las máquinas siguen siendo de la agencia: si el cliente nunca paga no se
 * pierde nada. El traspaso pasa una sola vez, dentro del webhook, y es idempotente.
 */
import type { AuthContext } from "../apiAuth";
import { db } from "../db";
import { grantAccess, SCOPES } from "../delegation";
import { sendTransactional } from "../emails/sendTransactional";
import { anchorSubscriptionToFirstOfMonth, createMachineCheckout, nextFirstOfMonth } from "../stripe_machines";
import { reassignSandboxOwnerHost } from "./sandboxOperations";
import { createSecret, getSecretValue, machineSecretName } from "./secretOperations";
import { attachPaidMachines } from "./machineOperations";

const DEAD = ["destroyed", "pending_deletion", "transferred"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_URL = process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://www.easybits.cloud";

function fail(status: number, error: string, message: string): never {
  throw new Response(JSON.stringify({ error, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Una fila del desglose. `waived` = se muestra tachada como «Descuento especial» y no se cobra. */
export type OfferItem = { label: string; qty: number; unitMxn: number; waived?: boolean };

/** Valida el desglose y regresa el total cobrable (suma de filas no bonificadas). */
export function normalizeOfferItems(raw: unknown): { items: OfferItem[]; totalMxn: number } {
  if (!Array.isArray(raw) || raw.length === 0) fail(400, "InvalidItems", "El desglose está vacío.");
  if (raw.length > 10) fail(400, "InvalidItems", "Máximo 10 conceptos en el desglose.");
  const items = raw.map((r) => {
    const it = r as Partial<OfferItem>;
    const label = String(it.label ?? "").trim().slice(0, 60);
    const qty = Number(it.qty);
    const unitMxn = Number(it.unitMxn);
    if (!label || !Number.isInteger(qty) || qty < 1 || !Number.isInteger(unitMxn) || unitMxn < 0) {
      fail(400, "InvalidItems", "Cada concepto lleva nombre, cantidad (entero ≥ 1) y precio (entero ≥ 0).");
    }
    return { label, qty, unitMxn, ...(it.waived ? { waived: true } : {}) };
  });
  const totalMxn = items.filter((i) => !i.waived).reduce((a, i) => a + i.qty * i.unitMxn, 0);
  return { items, totalMxn };
}

/** Texto corto del desglose para Stripe: «6 apps × $250 · 6 DBs × $200 (descuento especial)». */
export function describeOfferItems(items: OfferItem[]): string {
  return items
    .map((i) => `${i.qty} ${i.label} × $${i.unitMxn.toLocaleString("es-MX")}${i.waived ? " (descuento especial)" : ""}`)
    .join(" · ");
}

export type OfferView = {
  id: string;
  clientEmail: string;
  monthlyMxn: number;
  items: OfferItem[] | null;
  note: string | null;
  status: string;
  machines: { sandboxId: string; name: string | null }[];
  fromName: string | null;
  createdAt: string;
  // Si se suscribe hoy, cuándo se renueva: «1 de diciembre».
  renewsOn: string;
};

async function toView(o: {
  id: string; clientEmail: string; monthlyMxn: number; items?: unknown; note: string | null; status: string;
  sandboxIds: string[]; fromUserId: string; createdAt: Date;
}): Promise<OfferView> {
  const [rows, from] = await Promise.all([
    db.sandbox.findMany({ where: { sandboxId: { in: o.sandboxIds } }, select: { sandboxId: true, name: true } }),
    db.user.findUnique({ where: { id: o.fromUserId }, select: { displayName: true, email: true } }),
  ]);
  return {
    id: o.id,
    clientEmail: o.clientEmail,
    monthlyMxn: o.monthlyMxn,
    items: Array.isArray(o.items) ? (o.items as OfferItem[]) : null,
    note: o.note,
    status: o.status,
    machines: o.sandboxIds.map((id) => ({ sandboxId: id, name: rows.find((r) => r.sandboxId === id)?.name ?? null })),
    fromName: from?.displayName || from?.email || null,
    createdAt: o.createdAt.toISOString(),
    renewsOn: nextFirstOfMonth().toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" }),
  };
}

/** La agencia cede máquinas suyas, vivas y sin cobro, a un cliente por un total al mes. */
export async function createHostingOffer(
  ctx: AuthContext,
  params: { clientEmail: string; sandboxIds: string[]; monthlyMxn?: number; items?: OfferItem[]; note?: string }
): Promise<OfferView> {
  const clientEmail = params.clientEmail.trim().toLowerCase();
  const sandboxIds = [...new Set(params.sandboxIds)].filter(Boolean);
  // Con desglose, el total sale de las filas cobrables; sin él, el total que se escribió.
  const norm = params.items ? normalizeOfferItems(params.items) : null;
  const monthlyMxn = norm ? norm.totalMxn : Math.round(Number(params.monthlyMxn));
  if (!EMAIL_RE.test(clientEmail)) fail(400, "InvalidEmail", "Escribe el correo del cliente.");
  if (!sandboxIds.length) fail(400, "NoMachines", "Elige al menos una máquina.");
  if (sandboxIds.length > 12) fail(400, "TooManyMachines", "Máximo 12 máquinas por cesión.");
  if (!Number.isFinite(monthlyMxn) || monthlyMxn < 1) fail(400, "InvalidPrice", "Escribe el total al mes en pesos.");

  const me = await db.user.findUnique({ where: { id: ctx.user.id }, select: { email: true } });
  if (me?.email.toLowerCase() === clientEmail) fail(400, "SelfOffer", "No puedes cederte máquinas a ti mismo.");

  const rows = await db.sandbox.findMany({ where: { sandboxId: { in: sandboxIds } } });
  for (const id of sandboxIds) {
    const row = rows.find((r) => r.sandboxId === id);
    // Sólo el dueño cede (el staff opera, no traspasa).
    if (!row || row.ownerId !== ctx.user.id || DEAD.includes(row.status) || row.workBox) {
      fail(404, "MachineNotFound", `La máquina ${row?.name ?? id} no es tuya o ya no existe.`);
    }
    if (row.stripeSubItemId || row.stripeSubscriptionId) {
      fail(409, "AlreadyBilled", `La máquina ${row.name ?? id} ya tiene cobro; sólo se ceden máquinas sin cobro.`);
    }
  }
  const busy = await db.hostingOffer.findFirst({
    where: { status: "pending", sandboxIds: { hasSome: sandboxIds } },
    select: { clientEmail: true },
  });
  if (busy) fail(409, "AlreadyOffered", `Alguna de esas máquinas ya está cedida a ${busy.clientEmail}; cancela esa oferta primero.`);

  const offer = await db.hostingOffer.create({
    data: {
      fromUserId: ctx.user.id, clientEmail, sandboxIds, monthlyMxn,
      ...(norm ? { items: norm.items } : {}),
      note: params.note?.trim() || null,
    },
  });
  const view = await toView(offer);
  await sendOfferEmail(view).catch((e) => console.error("[hosting-offer] no se pudo mandar la invitación", e));
  return view;
}

async function sendOfferEmail(o: OfferView): Promise<void> {
  const what = o.note || `${o.machines.length} ${o.machines.length === 1 ? "app" : "apps"}`;
  const url = `${APP_URL}/dash/hosting`;
  await sendTransactional({
    to: o.clientEmail,
    subject: `${o.fromName ?? "Tu equipo"} te entrega ${what} en EasyBits`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#111">
      <p>Hola,</p>
      <p><b>${escapeHtml(o.fromName ?? "Tu equipo")}</b> te entrega <b>${escapeHtml(what)}</b>, ya montado y funcionando.</p>
      <p>Entra con este correo (${escapeHtml(o.clientEmail)}) y activa tu cobro de <b>$${o.monthlyMxn.toLocaleString("es-MX")} MXN al mes</b> en la sección Hosting. Pagas el mes en curso completo y la suscripción se renueva el ${escapeHtml(o.renewsOn)}; después, cada día 1. Desde ese momento las apps quedan a tu nombre.</p>
      <p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Ver mis apps</a></p>
    </div>`,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Para el banner del panel: cuántas cesiones esperan el pago de este correo y de quién. */
export async function pendingOffersForEmail(email: string): Promise<{ count: number; apps: number; fromName: string | null } | null> {
  const offers = await db.hostingOffer.findMany({
    where: { clientEmail: email.toLowerCase(), status: "pending" },
    select: { fromUserId: true, sandboxIds: true },
    orderBy: { createdAt: "desc" },
  });
  if (!offers.length) return null;
  const from = await db.user.findUnique({ where: { id: offers[0].fromUserId }, select: { displayName: true, email: true } });
  return {
    count: offers.length,
    apps: offers.reduce((a, o) => a + o.sandboxIds.length, 0),
    fromName: from?.displayName || from?.email || null,
  };
}

/** Ofertas que esperan pago: las que me hicieron (por mi correo) y las que hice yo. */
export async function listHostingOffers(ctx: AuthContext): Promise<{ incoming: OfferView[]; outgoing: OfferView[] }> {
  const me = await db.user.findUnique({ where: { id: ctx.user.id }, select: { email: true } });
  const [incoming, outgoing] = await Promise.all([
    me ? db.hostingOffer.findMany({ where: { clientEmail: me.email.toLowerCase(), status: "pending" }, orderBy: { createdAt: "desc" } }) : [],
    db.hostingOffer.findMany({ where: { fromUserId: ctx.user.id, status: "pending" }, orderBy: { createdAt: "desc" } }),
  ]);
  return { incoming: await Promise.all(incoming.map(toView)), outgoing: await Promise.all(outgoing.map(toView)) };
}

export async function cancelHostingOffer(ctx: AuthContext, offerId: string): Promise<{ ok: true }> {
  const offer = await db.hostingOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.fromUserId !== ctx.user.id || offer.status !== "pending") {
    fail(404, "OfferNotFound", "Esa oferta no existe o ya no está pendiente.");
  }
  await db.hostingOffer.update({ where: { id: offerId }, data: { status: "cancelled" } });
  return { ok: true };
}

/** El cliente activa su cobro: checkout de Stripe por el total acordado. */
export async function startHostingOfferCheckout(ctx: AuthContext, offerId: string): Promise<{ url: string }> {
  const [offer, me] = await Promise.all([
    db.hostingOffer.findUnique({ where: { id: offerId } }),
    db.user.findUnique({ where: { id: ctx.user.id }, select: { email: true, customer: true } }),
  ]);
  if (!offer || !me || offer.status !== "pending" || offer.clientEmail !== me.email.toLowerCase()) {
    fail(404, "OfferNotFound", "Esa oferta no existe o ya no está pendiente.");
  }
  // Revalidar: entre la oferta y el pago una máquina pudo borrarse o cobrarse aparte.
  const rows = await db.sandbox.findMany({ where: { sandboxId: { in: offer.sandboxIds } } });
  const okOwners = [offer.fromUserId, ctx.user.id];
  const broken = offer.sandboxIds.filter((id) => {
    const r = rows.find((x) => x.sandboxId === id);
    return !r || !okOwners.includes(r.ownerId) || DEAD.includes(r.status) || r.stripeSubItemId || r.stripeSubscriptionId;
  });
  if (broken.length) fail(409, "OfferStale", "Algo cambió en estas apps; pídele a quien te las entrega que vuelva a enviarte la oferta.");

  const { url } = await createMachineCheckout({
    ...(me.customer ? { customerId: me.customer } : { email: me.email }),
    userId: ctx.user.id,
    monthlyMxn: offer.monthlyMxn,
    quantity: 1,
    tier: "acordado",
    cpuMode: "shared",
    diskAddonsGB: 0,
    attachSandboxIds: offer.sandboxIds,
    offerId: offer.id,
    // Sin fecha: este texto se queda en la suscripción y en sus facturas de todos los meses.
    description: [
      ...(Array.isArray(offer.items) ? [describeOfferItems(offer.items as OfferItem[])] : []),
      "Hoy pagas el mes en curso completo; la suscripción se renueva cada día 1.",
    ].join(" · "),
    successUrl: `${APP_URL}/dash/hosting?activado=1`,
    cancelUrl: `${APP_URL}/dash/hosting`,
  });
  return { url };
}

/**
 * Traspasa UNA máquina de la agencia al cliente: secretos primero (si la caja reinicia ya con
 * el dueño nuevo, los encuentra), luego host y fila juntos, luego releases. Las máquinas
 * vendidas están protegidas: el host exige X-Operator-Token para cambiarles dueño.
 */
export async function transferMachine(sandboxId: string, fromId: string, toId: string): Promise<void> {
  const row = await db.sandbox.findUnique({ where: { sandboxId } });
  if (!row) throw new Error(`transferMachine: ${sandboxId} no existe`);
  if (row.ownerId === toId) return; // ya es suya (replay)
  if (row.ownerId !== fromId) throw new Error(`transferMachine: ${sandboxId} no es de ${fromId}`);

  const names = (((row.runspec as { secretNames?: string[] } | null)?.secretNames) ?? []) as string[];
  for (const n of names) {
    const scoped = machineSecretName(sandboxId, n);
    const value = (await getSecretValue(fromId, scoped).catch(() => null)) ?? (await getSecretValue(fromId, n).catch(() => null));
    if (value == null) throw new Error(`transferMachine: falta el secreto ${n} de ${sandboxId}`);
    await createSecret(toId, { name: scoped, value });
  }
  await reassignSandboxOwnerHost(sandboxId, toId, { asOperator: true });
  try {
    await db.sandbox.update({ where: { sandboxId }, data: { ownerId: toId } });
  } catch (e) {
    await reassignSandboxOwnerHost(sandboxId, fromId, { asOperator: true }).catch(() => undefined);
    throw e;
  }
  await db.machineRelease.updateMany({ where: { sandboxId, ownerId: fromId }, data: { ownerId: toId } });
}

/**
 * Webhook (checkout.session.completed con eb_offer_id): traspasa, pega el cobro, reparte el
 * precio acordado entre las máquinas y deja a la agencia como staff. Idempotente.
 */
export async function completeHostingOffer(params: {
  offerId: string;
  clientUserId: string;
  subscriptionId: string;
}): Promise<{ transferred: string[]; attached: string[]; skipped: string[] }> {
  const offer = await db.hostingOffer.findUnique({ where: { id: params.offerId } });
  if (!offer) throw new Error(`Oferta ${params.offerId} no existe`);
  if (offer.status === "paid" && offer.subscriptionId === params.subscriptionId) {
    return { transferred: [], attached: offer.sandboxIds, skipped: [] };
  }
  const client = await db.user.findUnique({ where: { id: params.clientUserId }, select: { id: true, email: true } });
  if (!client || client.email.toLowerCase() !== offer.clientEmail) {
    throw new Error(`Oferta ${offer.id}: pagó ${params.clientUserId}, que no es ${offer.clientEmail}`);
  }

  const transferred: string[] = [];
  for (const id of offer.sandboxIds) {
    const row = await db.sandbox.findUnique({ where: { sandboxId: id }, select: { ownerId: true } });
    if (row?.ownerId === offer.fromUserId) {
      await transferMachine(id, offer.fromUserId, client.id);
      transferred.push(id);
    }
  }
  const { attached, skipped } = await attachPaidMachines({
    ownerId: client.id,
    subscriptionId: params.subscriptionId,
    sandboxIds: offer.sandboxIds,
  });
  if (attached.length) {
    // Con desglose, cada máquina guarda el precio de la fila de apps (los extras, como correos,
    // no son de ninguna máquina); sin él, el total se reparte parejo.
    const items = Array.isArray(offer.items) ? (offer.items as OfferItem[]) : [];
    const appRow = items.find((i) => !i.waived && i.qty === offer.sandboxIds.length);
    const share = appRow ? appRow.unitMxn : Math.round((offer.monthlyMxn / attached.length) * 100) / 100;
    await db.sandbox.updateMany({ where: { sandboxId: { in: attached } }, data: { agreedMonthlyMxn: share } });
  }
  const agency = await db.user.findUnique({ where: { id: offer.fromUserId }, select: { email: true } });
  if (agency) {
    await grantAccess({ user: { id: client.id }, scopes: ["WRITE"] } as AuthContext, agency.email, [SCOPES.MACHINES])
      .catch((e) => console.error(`[hosting-offer] no se pudo dar staff a ${agency.email}`, e));
  }
  // Antes de marcarla pagada: si Stripe falla, el 500 hace que el webhook reintente esto.
  await anchorSubscriptionToFirstOfMonth(params.subscriptionId);
  await db.hostingOffer.update({
    where: { id: offer.id },
    data: { status: "paid", subscriptionId: params.subscriptionId, clientUserId: client.id, paidAt: new Date() },
  });
  return { transferred, attached, skipped };
}
