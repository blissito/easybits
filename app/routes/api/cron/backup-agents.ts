import { data } from "react-router";
import { backupPermanentAgents } from "~/.server/core/backupOperations";
import type { Route } from "./+types/backup-agents";

// Scheduled off-box backup of permanent agent (WhatsApp/Nanoclaw) state to
// Tigris. Same auth pattern as purge-files: Authorization: Bearer ${CRON_SECRET}.
// Triggered by .github/workflows/ on a daily schedule.
export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await backupPermanentAgents();
  return data(result);
};
