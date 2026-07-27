import { data } from "react-router";
import { reapIdleServiceBoxes } from "~/.server/core/fleetServiceOperations";
import type { Route } from "./+types/reap-service-boxes";

// Fallback scheduler for the fleet SERVICE-box reaper (voice/render/video/collab).
// El reaper in-process vive dentro de startReaper() (baileys.server.ts), que sólo
// arranca cuando la integración de WhatsApp rehidrata. Si Baileys no corre, esas
// cajas no se duermen NUNCA y sus huérfanas no se barren — se vio el 2026-07-27
// con una `render` marcada "activa" indefinidamente en el panel. Mismo patrón que
// reap-embed-agents / sweep-fleet-memory.
// Auth: Authorization: Bearer ${CRON_SECRET}.
export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await reapIdleServiceBoxes();
  return data(result);
};
