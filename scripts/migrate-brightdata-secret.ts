// One-off cleanup: move the raw Brightdata token that was hacked into a pool's
// mcpCatalog (env.API_TOKEN) into the owner's secrets vault as BRIGHTDATA_API_TOKEN,
// then drop the stored catalog (builtins + curated now live in code). The per-group
// `mcpServers: ["brightdata"]` selection stays — it resolves via the curated
// capability + the vault secret going forward.
//
//   npx tsx scripts/migrate-brightdata-secret.ts            # dry-run
//   npx tsx scripts/migrate-brightdata-secret.ts --apply    # write
import { db } from "../app/.server/db";
import { createSecret, getSecretValue } from "../app/.server/core/secretOperations";

const POOL_ID = "6a3c046d2cf7d7f4163f739d";
const SECRET_NAME = "BRIGHTDATA_API_TOKEN";

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = await db.pool.findUnique({
    where: { id: POOL_ID },
    select: { id: true, ownerId: true, mcpCatalog: true, groupConfigs: true },
  });
  if (!pool) {
    console.log(`pool ${POOL_ID} not found — nothing to do`);
    return;
  }
  const catalog = (pool.mcpCatalog as Array<{ name: string; env?: Record<string, string> }> | null) ?? [];
  const bd = catalog.find((e) => e.name === "brightdata");
  const rawToken = bd?.env?.API_TOKEN;

  console.log(`pool ${POOL_ID} owner ${pool.ownerId}`);
  console.log(`  stored catalog: [${catalog.map((e) => e.name).join(", ")}]`);
  console.log(`  raw brightdata token in catalog: ${rawToken ? `yes (len ${rawToken.length})` : "no"}`);

  const existing = await getSecretValue(pool.ownerId, SECRET_NAME).catch(() => null);
  console.log(`  secret ${SECRET_NAME} already in vault: ${existing ? "yes" : "no"}`);

  if (!apply) {
    console.log("\nDRY-RUN. Would:");
    if (rawToken && !existing) console.log(`  • createSecret(${pool.ownerId}, ${SECRET_NAME}, <token>)`);
    console.log(`  • set pool.mcpCatalog = null (drop hack + stale denik builtin; builtins/curated come from code)`);
    console.log(`  • keep groupConfigs as-is (brightdata stays enabled per group)`);
    console.log("\nRe-run with --apply to write.");
    return;
  }

  if (rawToken && !existing) {
    await createSecret(pool.ownerId, { name: SECRET_NAME, value: rawToken });
    console.log(`  ✓ secret ${SECRET_NAME} stored in vault`);
  } else if (existing) {
    console.log(`  • secret already present — not overwriting`);
  } else {
    console.log(`  ⚠ no raw token found and no secret present — set ${SECRET_NAME} manually for brightdata to work`);
  }
  // Drop the stored catalog: the old denik builtin and the raw-token brightdata
  // entry are both obsolete. Builtins (easybits/wa) + curated (brightdata) are
  // code-defined now; custom entries get re-added via the UI. Empty array = no
  // custom entries (mergedCapabilities falls back to curated only).
  await db.pool.update({ where: { id: POOL_ID }, data: { mcpCatalog: [] } });
  console.log(`  ✓ pool.mcpCatalog cleared (now [] — curated/builtins from code)`);
  console.log("done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => process.exit(0));
