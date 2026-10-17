import type { Route } from "./+types/admin.crons";
import { listCronOverview, requirePlatformAdmin } from "~/.server/cron";

// GET /api/v2/admin/crons — las tareas programadas con su estado, horario, próxima corrida
// y las últimas 20 corridas. Lo mismo que muestra /dash/admin/crons.
// Auth: scope ADMIN + superusuario (requirePlatformAdmin).
export async function loader({ request }: Route.LoaderArgs) {
  await requirePlatformAdmin(request);
  return Response.json({ items: await listCronOverview() });
}
