// Una sola vez (3-nov-2026): se cancela el esquema de $0. Las 6 apps de Acali regresan a la
// cuenta de Brenda hasta que José Luis se suscriba; su oferta lleva el desglose (6 apps × $250,
// 6 DBs administradas × $200 bonificadas). Al pagar, el webhook se las traspasa.
// Uso: npx tsx --tsconfig tsconfig.json --env-file=.env scripts/acali-reclaim.mts [--apply]
import { db } from "~/.server/db";
import { transferMachine } from "~/.server/core/hostingOfferOperations";

const JOSE = "6ae96fd5a93e8fafea2e7fcc";
const BRENDA = "69e19ed033ef9abb7cd5a54b";
const OFFER = "6aea0c69d5fe7c5e5f9e5cd8";
const ITEMS = [
  { label: "apps", qty: 6, unitMxn: 250 },
  { label: "DBs administradas", qty: 6, unitMxn: 200, waived: true },
];
const apply = process.argv.includes("--apply");

const offer = await db.hostingOffer.findUnique({ where: { id: OFFER } });
if (!offer || offer.status !== "pending") throw new Error("La oferta no está pendiente");
if (apply && !process.env.SANDBOX_HOST_OPERATOR_TOKEN) throw new Error("Falta SANDBOX_HOST_OPERATOR_TOKEN");

for (const id of offer.sandboxIds) {
  const row = await db.sandbox.findUnique({ where: { sandboxId: id }, select: { name: true, ownerId: true, stripeSubscriptionId: true } });
  if (row?.stripeSubscriptionId) throw new Error(`${row.name} ya tiene cobro; no se toca`);
  console.log(`${row?.name}: ${row?.ownerId === JOSE ? "José → Brenda" : row?.ownerId === BRENDA ? "ya es de Brenda" : "dueño inesperado"}`);
  if (apply && row?.ownerId === JOSE) await transferMachine(id, JOSE, BRENDA);
}
if (apply) {
  await db.hostingOffer.update({ where: { id: OFFER }, data: { items: ITEMS, monthlyMxn: 1500 } });
  console.log("oferta: desglose puesto, $1,500 al mes");
} else console.log("(dry-run; --apply para aplicar)");
process.exit(0);
