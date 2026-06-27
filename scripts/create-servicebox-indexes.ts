import { db } from "../app/.server/db";

// Crea los índices de la colección ServiceBox en prod SIN `prisma db push`
// (db push aborta por drift de índices / dups en prod — ver memoria
// project_agenda_prod_dbpush_blocked). Idempotente: createIndexes no falla si el
// índice ya existe con la misma definición.
//   - sandboxId  → unique (handle del box)
//   - ownerId+kind → unique (una caja por dueño y tipo; hace idempotente ensureServiceBox)
//   - ownerId    → index (lo usa el reaper / queries por dueño)
async function main() {
  const res = await db.$runCommandRaw({
    createIndexes: "ServiceBox",
    indexes: [
      { key: { sandboxId: 1 }, name: "ServiceBox_sandboxId_key", unique: true },
      { key: { ownerId: 1, kind: 1 }, name: "ServiceBox_ownerId_kind_key", unique: true },
      { key: { ownerId: 1 }, name: "ServiceBox_ownerId_idx" },
    ],
  });
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
