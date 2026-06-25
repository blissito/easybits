/**
 * One-off: refresh a pool's stored persona to the current default GHOSTY_PERSONA
 * (brevity + strict WhatsApp no-markdown guardrails). Existing pools baked the old
 * prompt at createPool; code changes only affect NEW pools, so update in place.
 * Run: npx tsx scripts/update-pool-persona.ts <poolId>
 */
import { PrismaClient } from "@prisma/client";
import { GHOSTY_PERSONA } from "../app/.server/core/poolOperations";

const db = new PrismaClient();

async function main() {
  const poolId = process.argv[2] || "6a3c046d2cf7d7f4163f739d";
  const before = await db.pool.findUnique({ where: { id: poolId }, select: { name: true } });
  if (!before) throw new Error(`pool ${poolId} not found`);
  await db.pool.update({ where: { id: poolId }, data: { persona: GHOSTY_PERSONA as any } });
  console.log(`UPDATED persona for pool "${before.name}" (${poolId})`);
  console.log("New SYSTEM_PROMPT length:", GHOSTY_PERSONA.env.SYSTEM_PROMPT.length);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
