import { data } from "react-router";
import {
  purgeExpiredMachines,
  reconcileProtection,
  reconcileReleasedBoxes,
} from "~/.server/core/machineOperations";
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
  // Re-apply the destroy lock on every billed machine. Cheap and idempotent,
  // and it closes the window where a failed protect call left a paid box
  // deletable by the host's stale sweep.
  const protection = await reconcileProtection();
  // Re-suspend released boxes that are still running. Their billing is already
  // cancelled, so one stuck here costs fleet capacity for free until the grace
  // window closes — and a host restart can revive one at any time.
  const released = await reconcileReleasedBoxes();
  return data({ ...result, protection, released });
};
