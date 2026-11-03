/**
 * One-off (2-nov-2026): las 6 apps de Acali Club pasan de Brenda a José Luis
 * (joseluis@acaliclub.com), que las paga desde el 3-nov. Brenda y bliss quedan como staff
 * (delegación "machines" sobre la cuenta de José Luis: operan, no cobran ni borran).
 *
 * Qué mueve por máquina: secretos con alcance de máquina (bóveda de Brenda → de José Luis),
 * Sandbox.ownerId, MachineRelease.ownerId y el dueño en el host (PATCH owner). Las filas
 * Site se quedan con Brenda a propósito: su editor y su agente constructor siguen igual y
 * llegan a la caja como staff.
 *
 *   npx tsx scripts/transfer-acali.mts            # dry-run
 *   npx tsx scripts/transfer-acali.mts --apply    # traspasa y da staff
 *   npx tsx scripts/transfer-acali.mts --link     # liga de pago (después de --apply y del deploy)
 */
import { randomUUID } from "node:crypto";
import { db } from "../app/.server/db";
import { getSandbox, reassignSandboxOwnerHost } from "../app/.server/core/sandboxOperations";
import { createSecret, getSecretValue, machineSecretName } from "../app/.server/core/secretOperations";
import { grantAccess, SCOPES } from "../app/.server/delegation";
import { createMachineCheckout } from "../app/.server/stripe_machines";
import type { AuthContext } from "../app/.server/apiAuth";

const FROM = "69e19ed033ef9abb7cd5a54b"; // brenda@fixter.org
const EMAIL = "joseluis@acaliclub.com";
const STAFF = ["brenda@fixter.org", "fixtergeek@gmail.com", "blissitos@gmail.com"];
const BOXES: Record<string, string> = {
  "sb_bcdeafdd-8e6f-4529-8385-555a63ba2dbe": "clave",
  "sb_7400adb9-32d5-4cb5-aecf-8f4a139a0b85": "clave-verano",
  "sb_8f189eb9-0109-4d43-950b-fe33d82a1559": "clave-nocturna",
  "sb_66855dd4-7a8a-4f9b-b52a-3e8daec7ad38": "aguas",
  "sb_bce47e82-917d-4e42-aaaf-784673b8708d": "aguas-verano",
  "sb_72586066-4747-4f19-af2d-ba1777a255c2": "aguas-nocturna",
};
// Precio acordado con José Luis (Brenda, 3-nov): $250 MXN/mes por las 6, no 6 × $49 de lista.
const MONTHLY_MXN = 250;

const apply = process.argv.includes("--apply");
if (apply && !process.env.SANDBOX_HOST_OPERATOR_TOKEN) throw new Error("Falta SANDBOX_HOST_OPERATOR_TOKEN (las cajas vendidas están protegidas)");
const link = process.argv.includes("--link");
const asUser = (id: string, scopes = ["READ", "WRITE"]) => ({ user: { id }, scopes } as AuthContext);

// --- cuenta --------------------------------------------------------------
let jose = await db.user.findUnique({ where: { email: EMAIL } });
if (!jose) {
  let host = EMAIL.split("@")[0];
  if (await db.user.findUnique({ where: { host } })) host = `${host}-${randomUUID().slice(0, 6)}`;
  console.log(`cuenta: crear ${EMAIL} (host=${host})`);
  if (apply) jose = await db.user.create({ data: { email: EMAIL, publicKey: randomUUID(), host, displayName: "José Luis" } });
} else console.log(`cuenta: ya existe ${jose.id}`);

// --- máquinas ------------------------------------------------------------
for (const [sandboxId, name] of Object.entries(BOXES)) {
  const row = await db.sandbox.findUnique({ where: { sandboxId } });
  if (!row || row.name !== name) throw new Error(`${name}: fila inesperada (${row?.name}), ABORTO`);
  if (jose && row.ownerId === jose.id) { console.log(`${name}: ya es de José Luis`); continue; }
  if (row.ownerId !== FROM) throw new Error(`${name}: dueño inesperado ${row.ownerId}, ABORTO`);
  if (row.stripeSubItemId || row.stripeSubscriptionId) throw new Error(`${name}: ya tiene cobro, ABORTO`);
  const host = await getSandbox(asUser(FROM), sandboxId);
  const ebTier = (host as any)?.metadata?.eb_tier;
  const names: string[] = ((row.runspec as any)?.secretNames ?? []) as string[];
  const rels = await db.machineRelease.count({ where: { sandboxId, ownerId: FROM } });
  console.log(`${name}: host=${(host as any)?.status} eb_tier=${ebTier ?? "FALTA"} secretos=${names.length} releases=${rels}`);
  if (!apply) continue;

  // 1) Secretos primero: si la caja reinicia ya con el dueño nuevo, los encuentra.
  for (const n of names) {
    const scoped = machineSecretName(sandboxId, n);
    const value = (await getSecretValue(FROM, scoped).catch(() => null)) ?? (await getSecretValue(FROM, n).catch(() => null));
    if (value == null) throw new Error(`${name}: falta el secreto ${n} en la bóveda de Brenda, ABORTO`);
    await createSecret(jose!.id, { name: scoped, value });
  }
  // 2) Host y fila juntos; si el host falla, la fila no se mueve.
  await reassignSandboxOwnerHost(sandboxId, jose!.id, { asOperator: true });
  try {
    await db.sandbox.update({ where: { sandboxId }, data: { ownerId: jose!.id } });
  } catch (e) {
    await reassignSandboxOwnerHost(sandboxId, FROM, { asOperator: true }).catch(() => undefined);
    throw e;
  }
  await db.machineRelease.updateMany({ where: { sandboxId, ownerId: FROM }, data: { ownerId: jose!.id } });
  console.log(`  → ${name} traspasada`);
}

// --- staff ---------------------------------------------------------------
for (const email of STAFF) {
  console.log(`staff: ${email} (machines)`);
  if (apply) await grantAccess(asUser(jose!.id), email, [SCOPES.MACHINES]);
}

// --- liga de pago --------------------------------------------------------
if (link) {
  if (!jose) throw new Error("Primero --apply");
  const ids = Object.keys(BOXES);
  const owned = await db.sandbox.count({ where: { sandboxId: { in: ids }, ownerId: jose.id } });
  if (owned !== ids.length) throw new Error(`Sólo ${owned}/${ids.length} son de José Luis; corre --apply`);
  const { url } = await createMachineCheckout({
    email: EMAIL,
    userId: jose.id,
    monthlyMxn: MONTHLY_MXN,
    quantity: 1,
    tier: "nano",
    cpuMode: "shared",
    diskAddonsGB: 0,
    attachSandboxIds: ids,
    successUrl: "https://www.easybits.cloud/dash/hosting",
    cancelUrl: "https://www.easybits.cloud/dash/hosting",
  });
  // La liga anterior ($294) se da de baja para que no se pague por error.
  const { getStripe } = await import("../app/.server/stripe");
  const stripe = getStripe();
  for (const old of (await stripe.checkout.sessions.list({ limit: 20, status: "open" })).data) {
    if (old.metadata?.eb_attach_ids && old.metadata?.eb_user_id === jose.id && old.url !== url) {
      await stripe.checkout.sessions.expire(old.id);
      console.log(`liga vieja expirada: ${old.id.slice(0, 20)}…`);
    }
  }
  console.log(`liga: ${url}  ($${MONTHLY_MXN} MXN/mes, se cobra al pagar)`);
}
if (!apply && !link) console.log("\n(dry-run: nada cambió; --apply para traspasar)");
await db.$disconnect();
