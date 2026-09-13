import { data } from "react-router";
import { checkHostedDomains, notifyHostingIncidents } from "~/.server/core/hostingMonitorOperations";
import type { Route } from "./+types/check-hosting";

// Cada 5 min: sondea los dominios de las cajas vendidas, reinicia la app si
// no responde y avisa a ADMIN_EMAILS. Mismo auth que los demás crons.
export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }
  const heal = new URL(request.url).searchParams.get("heal") !== "0";
  const { probed, down } = await checkHostedDomains({ heal });
  if (down.length) {
    console.error(`[check-hosting] ${down.length} down:`, down.map((d) => `${d.domain}→${d.action ?? "-"}/${d.ok ? "up" : "DOWN"}`).join(", "));
  }
  const notified = await notifyHostingIncidents(down);
  return data({ probed: probed.length, down, notified: notified.sent });
};
