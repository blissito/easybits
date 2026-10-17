import { data } from "react-router";
import { withCronRun } from "~/.server/cron";
import { reapIdleEmbedAgents } from "~/.server/core/embedAgentReaper";
import type { Route } from "./+types/reap-embed-agents";

// Respaldo del reaper de agentes embebidos. El reaper in-process corre dentro de
// startReaper() (baileys.server.ts), que arranca en la instancia que gana el lease de
// líder (lifecycle.server.ts → ensureRehydrated), haya o no WhatsApp conectado. Esta
// ruta queda como red de seguridad si el líder no existe (EB_BACKGROUND=off, dev).
// Auth: Authorization: Bearer ${CRON_SECRET} (same as purge-files/backup-agents).
export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }
  return withCronRun("reap-embed-agents", request, async () => {
    const result = await reapIdleEmbedAgents();
    return data(result);
  });
};
