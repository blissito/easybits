import { data } from "react-router";
import { purgeOldNotifications } from "~/.server/core/notificationOperations";
import type { Route } from "./+types/purge-notifications";

// Hard-delete notifications older than the 90-day retention window. The
// notification center only shows the latest 20, so older rows are dead weight
// that grows unbounded (one row per purge run per owner, etc.). Auth: Bearer
// ${CRON_SECRET}. Triggered by .github/workflows/purge-cron.yml.
export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await purgeOldNotifications();
  return data(result);
};
