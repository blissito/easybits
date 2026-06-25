/**
 * One-off: relax the idle reaper on existing pools so suspended VMs stay
 * resumable (~700-950ms snapshot resume) instead of being destroyed at 3min and
 * paying ~12s cold boot + restore-from-S3 on the next message. Code defaults only
 * apply to NEW pools, so bump destroyIdleMin in place.
 *
 * Run (all pools):      npx tsx scripts/update-pool-reap-timings.ts
 * Run (single pool):    npx tsx scripts/update-pool-reap-timings.ts <poolId>
 *
 * Env overrides: SUSPEND_MIN (default keep), DESTROY_MIN (default 45).
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const poolId = process.argv[2];
  const destroyMin = Number(process.env.DESTROY_MIN ?? 45);
  const suspendMin = process.env.SUSPEND_MIN ? Number(process.env.SUSPEND_MIN) : undefined;

  const pools = poolId
    ? await db.pool.findMany({ where: { id: poolId } })
    : await db.pool.findMany();
  if (!pools.length) throw new Error(poolId ? `pool ${poolId} not found` : "no pools");

  for (const p of pools) {
    const data: { destroyIdleMin: number; idleSuspendMin?: number } = { destroyIdleMin: destroyMin };
    if (suspendMin !== undefined) data.idleSuspendMin = suspendMin;
    await db.pool.update({ where: { id: p.id }, data });
    console.log(
      `UPDATED "${p.name ?? p.id}" (${p.id}): suspend ${p.idleSuspendMin}→${data.idleSuspendMin ?? p.idleSuspendMin}min, destroy ${p.destroyIdleMin}→${destroyMin}min`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
