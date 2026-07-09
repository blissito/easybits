import { data } from "react-router";
import { sweepOrphanFleetMemory } from "~/.server/core/fleetAgentOperations";
import type { Route } from "./+types/sweep-fleet-memory";

// Fallback scheduler for the orphan fleet-memory blob sweep. The in-process sweep
// runs inside startReaper() (baileys.server.ts, every ~30min) which only boots
// when the WhatsApp integration is active. For deployments that don't run Baileys
// (or as a safety net), an external scheduler can hit this periodically.
// Auth: Authorization: Bearer ${CRON_SECRET} (same as purge-files/reap-embed-agents).
export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sweepOrphanFleetMemory();
  return data(result);
};
