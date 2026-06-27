/**
 * One-off: dump sandboxIds easybits still tracks (any status that could resume),
 * so the box cleanup can KEEP their snapshot files and only reclaim truly-dead VMs.
 * Run: npx tsx scripts/dump-agent-sandboxids.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const agents = await db.agent.findMany({
    select: { sandboxId: true, status: true, name: true, fleetAgentId: true },
  });
  // KEEP anything not terminally dead — these are rows easybits may still
  // resume/route to; deleting their snapshots would lose state.
  const keepStatuses = new Set(["running", "suspended", "building", "starting"]);
  const keep = agents.filter((a) => keepStatuses.has(a.status));
  console.log("AGENT_TOTAL", agents.length);
  console.log("AGENT_KEEP", keep.length);
  for (const a of keep) {
    console.log("KEEP", a.sandboxId, a.status, a.fleetAgentId ? "fleetAgent" : "standalone", a.name ?? "");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
