import { db } from "../app/.server/db";

// Crea los índices de la colección SandboxSnapshot en prod SIN `prisma db push`
// (db push aborta por drift en prod — ver memoria project_agenda_prod_dbpush_blocked).
// Idempotente: createIndexes no falla si el índice ya existe con la misma definición.
//   - snapshotId → unique (handle del snapshot en el host)
//   - ownerId    → index (listado/scoping por dueño)
async function main() {
  const res = await db.$runCommandRaw({
    createIndexes: "SandboxSnapshot",
    indexes: [
      { key: { snapshotId: 1 }, name: "SandboxSnapshot_snapshotId_key", unique: true },
      { key: { ownerId: 1 }, name: "SandboxSnapshot_ownerId_idx" },
    ],
  });
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
