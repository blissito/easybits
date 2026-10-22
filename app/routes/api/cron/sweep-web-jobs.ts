import { data } from "react-router";
import { withCronRun } from "~/.server/cron";
import { sweepWebJobs } from "~/.server/core/webJobsOperations";
import type { Route } from "./+types/sweep-web-jobs";

// Cada minuto: avisa por webhook (web.extract.completed/failed) cuando termina un
// web_extract y borra los cuerpos de web_fetch vencidos. Mismo auth que los demás crons.
export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }
  return withCronRun("sweep-web-jobs", request, async () => data(await sweepWebJobs()));
};
