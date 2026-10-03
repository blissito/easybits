import { db } from "../app/.server/db";

// Crea los índices de FleetAgentAuthKey en prod SIN `prisma db push` (db push aborta
// por drift de índices en prod). Idempotente: createIndexes no falla si ya existen
// con la misma definición. Correr ANTES de desplegar el código que usa la colección:
//   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/create-authkey-indexes.ts
//   - fleetAgentId+type+keyId → unique (una fila por llave; hace idempotente el upsert)
//   - fleetAgentId            → index (carga y borrado por agente)
async function main() {
  const res = await db.$runCommandRaw({
    createIndexes: "FleetAgentAuthKey",
    indexes: [
      {
        key: { fleetAgentId: 1, type: 1, keyId: 1 },
        name: "FleetAgentAuthKey_fleetAgentId_type_keyId_key",
        unique: true,
      },
      { key: { fleetAgentId: 1 }, name: "FleetAgentAuthKey_fleetAgentId_idx" },
    ],
  });
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
