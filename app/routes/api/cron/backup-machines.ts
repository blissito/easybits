import { data } from "react-router";
import {
  backupPermanentMachines,
  staleBackupMachines,
} from "~/.server/core/machineBackupOperations";
import type { Route } from "./+types/backup-machines";

// Daily off-host backup of permanent machines' DATA to Tigris (7-day retention,
// included in the machine price — the same deal Fly gives on volumes). Same auth
// pattern as backup-agents: Authorization: Bearer ${CRON_SECRET}.
//
// Reports stale machines alongside the run: a backup that quietly stopped
// happening looks exactly like one that is working until you need it.
export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await backupPermanentMachines();
  const { stale, unprotected } = await staleBackupMachines();
  const label = (m: { sandboxId: string; name: string | null }) =>
    m.name ? `${m.sandboxId} (${m.name})` : m.sandboxId;
  if (stale.length) {
    console.error(
      `[backup-machines] ${stale.length} machine(s) without a fresh backup:`,
      stale.map(label).join(", ")
    );
  }
  // Same severity as stale on purpose: these are not being backed up at all.
  // Either the box is genuinely stateless (fine) or someone forgot to declare
  // runspec.dataPaths and its data is one lost host away from gone — and from
  // here the two are indistinguishable, so a human has to look.
  if (unprotected.length) {
    console.error(
      `[backup-machines] ${unprotected.length} machine(s) with no backup configured (no runspec.dataPaths):`,
      unprotected.map(label).join(", ")
    );
  }
  return data({ ...result, stale, unprotected });
};
