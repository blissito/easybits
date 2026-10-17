import { data } from "react-router";
import { purgeOldCronRuns, withCronRun } from "~/.server/cron";
import { purgeOldNotifications } from "~/.server/core/notificationOperations";
import type { Route } from "./+types/purge-notifications";

// Hard-delete notifications older than the 90-day retention window. The
// notification center only shows the latest 20, so older rows are dead weight
// that grows unbounded (one row per purge run per owner, etc.). Auth: Bearer
// ${CRON_SECRET}. Triggered by .github/workflows/purge-cron.yml.
// También aplica la retención de 90 días del historial de crons (CronRun).
export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }
  return withCronRun("purge-notifications", request, async () => {
    const result = await purgeOldNotifications();
    const cronRuns = await purgeOldCronRuns();
    return data({ ...result, cronRunsPurged: cronRuns.purged });
  });
};
