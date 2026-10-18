import { data } from "react-router";
import { withCronRun } from "~/.server/cron";
import { dispatchDueUserCrons } from "~/.server/core/userCronOperations";
import type { Route } from "./+types/dispatch-user-crons";

// Cada minuto: corre los crons de usuario vencidos (userCronOperations.ts). Mismo auth que
// los demás crons. El reclamo atómico hace inofensivo que llegue dos veces.
export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }
  return withCronRun("dispatch-user-crons", request, async () => data(await dispatchDueUserCrons()));
};
