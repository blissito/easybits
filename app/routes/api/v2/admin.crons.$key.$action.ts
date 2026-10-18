import type { Route } from "./+types/admin.crons.$key.$action";
import { CronRunError, listCronRuns, requirePlatformAdmin, setCronPaused, startManualRun } from "~/.server/cron";
import { getCronJob } from "~/lib/cronJobs";

// GET  /api/v2/admin/crons/:key/runs   — últimas 50 ejecuciones (con el error completo)
// POST /api/v2/admin/crons/:key/run    — corre la tarea en segundo plano (trigger "manual")
// POST /api/v2/admin/crons/:key/pause  — { paused: boolean }
// Auth: scope ADMIN + superusuario (requirePlatformAdmin).
const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function loader({ request, params }: Route.LoaderArgs) {
  await requirePlatformAdmin(request);
  if (params.action !== "runs") return fail("Not found", 404);
  if (!getCronJob(params.key)) return fail(`Tarea desconocida: ${params.key}`, 404);
  return Response.json({ items: await listCronRuns(params.key) });
}

export async function action({ request, params }: Route.ActionArgs) {
  const ctx = await requirePlatformAdmin(request);
  if (request.method !== "POST") return fail("Method not allowed", 405);
  try {
    if (params.action === "run") {
      return Response.json(await startManualRun(params.key), { status: 202 });
    }
    if (params.action === "pause") {
      const body = (await request.json().catch(() => ({}))) as { paused?: unknown };
      if (typeof body.paused !== "boolean") return fail("paused (boolean) requerido", 400);
      const state = await setCronPaused(params.key, body.paused, ctx.user.email);
      return Response.json({ job: state.job, paused: state.paused, pausedBy: state.pausedBy, pausedAt: state.pausedAt });
    }
    return fail("Not found", 404);
  } catch (e) {
    if (e instanceof CronRunError) return fail(e.message, e.status);
    throw e;
  }
}
