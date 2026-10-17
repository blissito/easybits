import { data } from "react-router";
import { withCronRun } from "~/.server/cron";
import { reapIdleServiceBoxes } from "~/.server/core/fleetServiceOperations";
import type { Route } from "./+types/reap-service-boxes";

// Fallback scheduler for the fleet SERVICE-box reaper (voice/render/video/collab).
// El reaper in-process vive dentro de startReaper() (baileys.server.ts), que arranca
// en la instancia que gana el lease de líder (lifecycle.server.ts → ensureRehydrated),
// haya o no WhatsApp conectado. Sin líder (EB_BACKGROUND=off, dev) esas cajas no se
// duermen y sus huérfanas no se barren — se vio el 2026-07-27 con una `render`
// marcada "activa" indefinidamente. Esta ruta es la red de seguridad.
// Auth: Authorization: Bearer ${CRON_SECRET}.
export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }
  return withCronRun("reap-service-boxes", request, async () => {
    const result = await reapIdleServiceBoxes();
    return data(result);
  });
};
