// Baja a Byte las cuentas Mega promo (Anuar + Oswaldo).
// Uso desde el repo /Users/bliss/easybits:
//   DRY-RUN: node --env-file=.env scripts/downgrade-mega-to-byte.mjs
//   APLICAR: node --env-file=.env scripts/downgrade-mega-to-byte.mjs --apply
//
// Toca AMBOS lugares donde vive el plan o getUserPlan() resuelve mal:
//   - roles[]: quita Mega/Flow/Tera/Studio, pone Byte
//   - metadata.plan: "Byte"   (Oswaldo trae "Tera" basura -> se limpia)
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const TARGETS = ["anuar@ciudadinmersiva.com", "martinez.anaya.oswaldo@gmail.com"];
const PLAN_ROLES = ["Mega", "Flow", "Tera", "Studio", "Spark"]; // roles de plan a remover (Byte/Spark abajo se re-agrega Byte)

console.log(APPLY ? "=== APLICANDO ===" : "=== DRY-RUN (usa --apply para ejecutar) ===\n");

for (const email of TARGETS) {
  const u = await db.user.findFirst({ where: { email } });
  if (!u) {
    console.log(`⚠️  NO ENCONTRADO: ${email}`);
    continue;
  }
  const oldRoles = u.roles || [];
  const newRoles = [...oldRoles.filter((r) => !PLAN_ROLES.includes(r) && r !== "Byte"), "Byte"];
  const oldMeta = u.metadata || {};
  const newMeta = { ...oldMeta, plan: "Byte" };

  console.log(`• ${email} (${u.displayName || "—"})`);
  console.log(`    roles:        ${JSON.stringify(oldRoles)}  ->  ${JSON.stringify(newRoles)}`);
  console.log(`    metadata.plan: ${JSON.stringify(oldMeta.plan ?? null)}  ->  "Byte"`);

  if (APPLY) {
    await db.user.update({
      where: { id: u.id },
      data: { roles: newRoles, metadata: newMeta },
    });
    console.log(`    ✅ actualizado`);
  }
  console.log("");
}

await db.$disconnect();
console.log(APPLY ? "Listo." : "Sin cambios (dry-run).");
