/**
 * One-off cutover migration: Pool → FleetAgent (DB + S3 memory blobs).
 *
 * Run AT cutover, coordinated with the app deploy (see plan
 * luminous-noodling-patterson.md "Cutover ordering"):
 *   npx tsx scripts/migrate-pool-to-fleetagent.ts
 *
 * What it does (all idempotent — safe to re-run):
 *   1. renameCollection  Pool→FleetAgent, PoolRoute→FleetAgentRoute,
 *                         PoolMessage→FleetAgentMessage.
 *   2. $rename field      poolId→fleetAgentId on FleetAgentRoute,
 *                         FleetAgentMessage, and Agent (only docs that still
 *                         carry poolId).
 *   3. S3 memory blobs    copy pool-memory/<id>/<uuid>.tgz →
 *                         fleet-memory/<id>/<uuid>.tgz for every route, so
 *                         suspended conversations keep their memory (the new
 *                         code reads from fleet-memory/). Best-effort per blob.
 *
 * The DB step is the hard cutover. The S3 copy preserves conversation memory
 * (NEVER delete user data) — the old pool-memory/ objects are left in place.
 */
import "dotenv/config";
import { MongoClient } from "mongodb";
import { getPlatformDefaultClient } from "../app/.server/storage";

const RENAMES: Array<[string, string]> = [
  ["Pool", "FleetAgent"],
  ["PoolRoute", "FleetAgentRoute"],
  ["PoolMessage", "FleetAgentMessage"],
];
const FIELD_RENAME_COLLECTIONS = ["FleetAgentRoute", "FleetAgentMessage", "Agent"];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set (load .env)");
  const client = new MongoClient(url);
  await client.connect();
  const dbName = new URL(url).pathname.replace(/^\//, "").split("?")[0] || "easybits_for_ai";
  const db = client.db(dbName);
  console.log(`→ DB: ${dbName}`);

  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));

  // 1. renameCollection (idempotent)
  for (const [from, to] of RENAMES) {
    if (existing.has(to)) {
      console.log(`  ✓ ${to} already exists — skip rename`);
      continue;
    }
    if (!existing.has(from)) {
      console.log(`  ! ${from} missing and ${to} absent — nothing to rename`);
      continue;
    }
    await db.renameCollection(from, to);
    console.log(`  ✓ renamed ${from} → ${to}`);
  }

  // 2. $rename poolId → fleetAgentId (only docs that still have poolId)
  for (const coll of FIELD_RENAME_COLLECTIONS) {
    const names = new Set((await db.listCollections().toArray()).map((c) => c.name));
    if (!names.has(coll)) {
      console.log(`  ! ${coll} absent — skip field rename`);
      continue;
    }
    const res = await db
      .collection(coll)
      .updateMany({ poolId: { $exists: true } }, { $rename: { poolId: "fleetAgentId" } });
    console.log(`  ✓ ${coll}: renamed poolId→fleetAgentId in ${res.modifiedCount} docs`);
  }

  // 2b. Indexes — renameCollection PRESERVES indexes by their OLD name, and they
  // still reference the OLD field `poolId` (now renamed). The unique index
  // PoolRoute_poolId_groupId_key would silently index null → broken uniqueness.
  // Drop the stale Pool* indexes and recreate on the new field names.
  const dropIdx = async (coll: string, name: string) => {
    try { await db.collection(coll).dropIndex(name); } catch { /* already gone */ }
  };
  await dropIdx("FleetAgentRoute", "PoolRoute_poolId_groupId_key");
  await dropIdx("FleetAgentRoute", "PoolRoute_agentId_idx");
  await db.collection("FleetAgentRoute").createIndex({ fleetAgentId: 1, groupId: 1 }, { unique: true, name: "FleetAgentRoute_fleetAgentId_groupId_key" });
  await db.collection("FleetAgentRoute").createIndex({ agentId: 1 }, { name: "FleetAgentRoute_agentId_idx" });
  await dropIdx("FleetAgentMessage", "PoolMessage_poolId_groupId_idx");
  await db.collection("FleetAgentMessage").createIndex({ fleetAgentId: 1, groupId: 1 }, { name: "FleetAgentMessage_fleetAgentId_groupId_idx" });
  await dropIdx("FleetAgent", "Pool_token_key");
  await dropIdx("FleetAgent", "Pool_ownerId_idx");
  await db.collection("FleetAgent").createIndex({ token: 1 }, { unique: true, name: "FleetAgent_token_key" });
  await db.collection("FleetAgent").createIndex({ ownerId: 1 }, { name: "FleetAgent_ownerId_idx" });
  console.log("  ✓ indexes dropped (Pool*) + recreated on fleetAgentId");

  // 3. S3 memory blobs: pool-memory/<id>/<uuid>.tgz → fleet-memory/<id>/<uuid>.tgz
  const routes = await db
    .collection("FleetAgentRoute")
    .find({}, { projection: { fleetAgentId: 1, sessionUuid: 1 } })
    .toArray();
  const fromMem = getPlatformDefaultClient({ prefix: "pool-memory/" });
  const toMem = getPlatformDefaultClient({ prefix: "fleet-memory/" });
  let copied = 0;
  for (const r of routes) {
    const id = String(r.fleetAgentId ?? "");
    const uuid = String(r.sessionUuid ?? "");
    if (!id || !uuid) continue;
    const key = `${id}/${uuid}.tgz`;
    try {
      const readUrl = await fromMem.getReadUrl(key).catch(() => null);
      if (!readUrl) continue;
      const resp = await fetch(readUrl);
      if (!resp.ok) continue;
      const buf = Buffer.from(await resp.arrayBuffer());
      if (!buf.length) continue;
      await toMem.putObject(key, buf, "application/gzip");
      copied++;
      console.log(`  ✓ memory blob copied: ${key} (${buf.length} bytes)`);
    } catch (e) {
      console.log(`  ! blob ${key} skipped: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`→ memory blobs copied: ${copied}/${routes.length} routes`);

  await client.close();
  console.log("✓ migration complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
