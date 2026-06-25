import { data } from "react-router";
import { reapIdleEmbedAgents } from "~/.server/core/embedAgentReaper";
import type { Route } from "./+types/reap-embed-agents";

// Fallback scheduler for the embed-agent idle reaper. The in-process reaper
// runs inside startReaper() (baileys.server.ts) which only boots when the
// WhatsApp integration is active. For deployments that don't run Baileys (or as
// a safety net), an external scheduler can hit this every minute.
// Auth: Authorization: Bearer ${CRON_SECRET} (same as purge-files/backup-agents).
export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await reapIdleEmbedAgents();
  return data(result);
};
