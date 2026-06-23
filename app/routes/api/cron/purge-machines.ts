import { data } from "react-router";
import { purgeExpiredMachines } from "~/.server/core/machineOperations";
import type { Route } from "./+types/purge-machines";

// Hard-delete permanent machines whose 7-day soft-delete grace has elapsed.
// Released machines are suspended (data kept) + scheduled; this finally destroys
// the VM and frees the disk. NEVER purges before the 7-day window (the query
// filters deletionScheduledAt < now-7d). Auth: Bearer ${CRON_SECRET}.
export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await purgeExpiredMachines();
  return data(result);
};
