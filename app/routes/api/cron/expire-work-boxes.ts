import { data } from "react-router";
import { expireIdleWorkBoxes } from "~/.server/core/workBoxExpiry";
import type { Route } from "./+types/expire-work-boxes";

// Diario: avisa y archiva las web apps sin publicar que llevan días sin turnos (workBoxExpiry.ts).
// Mismo auth que backup-machines: Authorization: Bearer ${CRON_SECRET}. Sin export default (ruta de recurso).
export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await expireIdleWorkBoxes();
  if (result.failed.length) console.error("[expire-work-boxes] fallaron:", JSON.stringify(result.failed));
  console.log(`[expire-work-boxes] revisadas ${result.checked} · avisadas ${result.warned.length} · archivadas ${result.archived.length}`);
  return Response.json(result);
};
