import { data } from "react-router";
import { withCronRun } from "~/.server/cron";
import { runWebCanary } from "~/.server/core/webJobsOperations";
import type { Route } from "./+types/check-web";

// Cada 15 min: la plataforma busca, lee Amazon MX y extrae de Mercado Libre como lo haría
// un cliente. Guarda el resultado (lo muestran /status y /api/health/web) y avisa a
// ADMIN_EMAILS a la segunda falla seguida.
export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }
  return withCronRun("check-web", request, async () => data(await runWebCanary()));
};
