import { data } from "react-router";
import { pruneExpiredBackups } from "~/.server/core/machineBackupOperations";
import type { Route } from "./+types/prune-backups";

// Rotate machine backups past their retention window. Never drops a machine's
// most recent copy, and only deletes when a newer available one exists — blind
// rotation is how you find out you have zero backups on the worst possible day.
export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await pruneExpiredBackups();
  return data(result);
};
