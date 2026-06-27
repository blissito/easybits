/**
 * One-off: refresh a fleetAgent's stored persona to the current default GHOSTY_PERSONA
 * (brevity + strict WhatsApp no-markdown guardrails). Existing pools baked the old
 * prompt at createFleetAgent; code changes only affect NEW pools, so update in place.
 * Run: npx tsx scripts/update-fleet-agent-persona.ts <fleetAgentId>
 */
import { PrismaClient } from "@prisma/client";
import { GHOSTY_PERSONA } from "../app/.server/core/fleetAgentOperations";

const db = new PrismaClient();

async function main() {
  const fleetAgentId = process.argv[2] || "6a3c046d2cf7d7f4163f739d";
  const before = await db.fleetAgent.findUnique({ where: { id: fleetAgentId }, select: { name: true } });
  if (!before) throw new Error(`fleetAgent ${fleetAgentId} not found`);
  await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { persona: GHOSTY_PERSONA as any } });
  console.log(`UPDATED persona for fleetAgent "${before.name}" (${fleetAgentId})`);
  console.log("New SYSTEM_PROMPT length:", GHOSTY_PERSONA.env.SYSTEM_PROMPT.length);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
