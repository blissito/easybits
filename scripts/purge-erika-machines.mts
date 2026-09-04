/**
 * One-off: destruir las dos máquinas de Erika (foglzerika@gmail.com) que
 * quedaron en `pending_deletion` cuando el borrado todavía era soft.
 *
 * Hace lo mismo que purgeExpiredMachines pero sin esperar el cutoff de 7 días,
 * y sobre ids explícitos: un script que barre por fecha es fácil de disparar
 * contra la máquina equivocada.
 *
 *   npx tsx scripts/purge-erika-machines.mts          # dry-run
 *   npx tsx scripts/purge-erika-machines.mts --apply
 */
import { db } from "../app/.server/db";
import { destroySandbox } from "../app/.server/core/sandboxOperations";
import { extendBackupsForDeletedMachine } from "../app/.server/core/machineBackupOperations";
import type { AuthContext } from "../app/.server/apiAuth";

const OWNER_ID = "6a9786c99253827fb9e07f75";
const SANDBOX_IDS = [
  "sb_685495a7-e212-49c4-8cec-08bda72921f9",
  "sb_6c8b42a8-956c-43c9-a2f2-c954d796e0ee",
];
const apply = process.argv.includes("--apply");

for (const sandboxId of SANDBOX_IDS) {
  const row = await db.sandbox.findUnique({ where: { sandboxId } });
  if (!row) { console.log(`${sandboxId}: sin fila, skip`); continue; }
  if (row.ownerId !== OWNER_ID) { console.log(`${sandboxId}: owner inesperado ${row.ownerId}, ABORTO`); continue; }
  if (row.status === "destroyed") { console.log(`${sandboxId}: ya destruida`); continue; }

  const backup = await db.sandboxBackup.findFirst({
    where: { sandboxId, status: "available" },
    orderBy: { createdAt: "desc" },
  });
  console.log(`${sandboxId} status=${row.status} backup=${backup ? `${backup.id} (${backup.bytes}B)` : "NINGUNO"}`);
  if (!apply) continue;

  const ctx = { user: { id: row.ownerId }, scopes: ["WRITE", "DELETE"] } as AuthContext;
  await destroySandbox(ctx, sandboxId, { asOperator: true });
  await db.sandbox.update({
    where: { sandboxId },
    data: { status: "destroyed", deletionScheduledAt: null },
  });
  await extendBackupsForDeletedMachine(sandboxId);
  console.log(`  → destruida, retención del backup extendida a 30 días`);
}
process.exit(0);
