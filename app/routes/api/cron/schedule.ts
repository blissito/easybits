import { data } from "react-router";
import { CRON_JOBS } from "~/lib/cronJobs";
import type { Route } from "./+types/schedule";

// GET /api/cron/schedule — la tabla de tareas (app/lib/cronJobs.ts). La consume el servicio
// Restate `eb-cron` para crear/actualizar/cancelar sus CronJob: cambiar un horario = editar
// la tabla y desplegar. Mismo auth que los demás crons. Ruta de recurso: sin export default.
export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }
  return data({ items: CRON_JOBS });
};
