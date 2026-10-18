import { data } from "react-router";
import { withCronRun } from "~/.server/cron";
import { sweepOrphanFleetMemory } from "~/.server/core/fleetAgentOperations";
import type { Route } from "./+types/sweep-fleet-memory";

// Barrido de blobs de memoria huérfanos de la flota. El barrido in-process corre dentro
// de startReaper() (baileys.server.ts, cada ~30 min) en la instancia que gana el lease
// de líder (lifecycle.server.ts), haya o no WhatsApp conectado. Esta ruta es la ejecución
// semanal programada y la red de seguridad si no hay líder (EB_BACKGROUND=off, dev).
// Auth: Authorization: Bearer ${CRON_SECRET} (same as purge-files/reap-embed-agents).
export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }
  return withCronRun("sweep-fleet-memory", request, async () => {
    const result = await sweepOrphanFleetMemory();
    return data(result);
  });
};
