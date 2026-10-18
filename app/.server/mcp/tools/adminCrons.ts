// Tools del copiloto del panel de crons (grupo `admin-crons`). Sólo superusuarios de la
// plataforma (ADMIN_EMAILS o rol Admin).
//
// ⚠️ Scope READ/WRITE, NO ADMIN, a propósito: la llave del copiloto vive dentro de su
// microVM, que es justo lo que un prompt malicioso puede leer. Con ADMIN, esa llave podría
// pegarle directo a `POST /api/v2/admin/crons/:job/run` y saltarse la confirmación. Aquí no
// hace falta: las dos tools que mutan sólo PROPONEN (crean una AgentAction pendiente) y la
// ejecución exige la sesión del humano: el `resume` de AG-UI en `/api/v2/admin/copilot/chat`.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiKeyScope } from "@prisma/client";
import type { AuthContext } from "../../apiAuth";
import { requireScope } from "../../apiAuth";
import { isAdminUser } from "../../getters";
import { listCronOverview, listCronRuns } from "../../cron";
import { getCronJob } from "~/lib/cronJobs";
import { proposeAction } from "../../core/agentActions";
import { ok, fail, paginate } from "../responses";

export const ADMIN_CRON_TOOLS = ["list_crons", "get_cron_runs", "run_cron", "pause_cron"] as const;

/** Superusuario + scope. Lanza un Response 403 que wrapHandler convierte en fail(). */
export function requireCronAdmin(ctx: AuthContext | undefined, scope: ApiKeyScope) {
  if (!ctx?.user) throw Response.json({ error: "Unauthorized" }, { status: 401 });
  requireScope(ctx, scope);
  if (!isAdminUser(ctx.user)) {
    throw Response.json({ error: "Sólo superusuarios de la plataforma", reason: "platform_admin_only" }, { status: 403 });
  }
  return ctx;
}

/** Respuesta de una propuesta: éxito (sin isError) para que el modelo NO reintente. */
export function needsConfirmation(action: { id: string; summary: string; expiresAt: string }) {
  return ok({
    needs_confirmation: true,
    actionId: action.id,
    summary: action.summary,
    expiresAt: action.expiresAt,
    message: `No se ejecutó todavía: al usuario le apareció una tarjeta para aprobar «${action.summary}». No reintentes; dile que la apruebe.`,
  });
}

const jobShape = z.string().describe("key de la tarea (de list_crons), p. ej. `purge-notifications`");

type Wrap = <T>(fn: (params: T, extra: any) => Promise<any>) => (params: T, extra: any) => Promise<any>;

export function registerAdminCronTools(server: McpServer, wrapHandler: Wrap) {
  server.tool(
    "list_crons",
    "SÓLO superusuarios. Tareas programadas de la plataforma EasyBits con su estado: { items:[{ key, name, schedule, status (nuevo|al-dia|tarde|fallo|pausado), paused, running, nextRunAt, lastRun, recent[] }] }. `recent` son las últimas 20 corridas SIN el error; para leer por qué falló una usa get_cron_runs.",
    {},
    wrapHandler(async (_p, extra) => {
      requireCronAdmin(extra?.authInfo as AuthContext, "READ");
      const items = await listCronOverview();
      return ok(paginate(items, { total: items.length }));
    })
  );

  server.tool(
    "get_cron_runs",
    "SÓLO superusuarios. Últimas corridas de UNA tarea (más reciente primero), con el `error` completo de las fallidas: { items:[{ id, trigger, startedAt, finishedAt, ok, status, durationMs, summary, error, running }] }.",
    { job: jobShape, limit: z.number().int().min(1).max(50).optional().describe("cuántas (default 20, máx 50)") },
    wrapHandler(async (p: { job: string; limit?: number }, extra) => {
      requireCronAdmin(extra?.authInfo as AuthContext, "READ");
      if (!getCronJob(p.job)) return fail(`Tarea desconocida: ${p.job}`, { status: 404 });
      const items = await listCronRuns(p.job, p.limit ?? 20);
      return ok(paginate(items, { total: items.length }));
    })
  );

  server.tool(
    "run_cron",
    "SÓLO superusuarios. PROPONE ejecutar ahora una tarea (trigger «manual»). NO la ejecuta: crea una acción pendiente y devuelve { needs_confirmation:true, actionId, summary }; el humano la aprueba en una tarjeta con su sesión (vence en 15 min). No es un error: no reintentes, dile que apruebe.",
    { job: jobShape },
    wrapHandler(async (p: { job: string }, extra) => {
      const ctx = requireCronAdmin(extra?.authInfo as AuthContext, "WRITE");
      if (!getCronJob(p.job)) return fail(`Tarea desconocida: ${p.job}`, { status: 404 });
      return needsConfirmation(await proposeAction(ctx.user.id, "run_cron", { job: p.job }));
    })
  );

  server.tool(
    "pause_cron",
    "SÓLO superusuarios. PROPONE pausar (`paused:true`) o reanudar (`paused:false`) una tarea. NO la cambia: crea una acción pendiente y devuelve { needs_confirmation:true, actionId, summary }; el humano la aprueba con su sesión (vence en 15 min). No es un error: no reintentes.",
    { job: jobShape, paused: z.boolean().describe("true = pausar, false = reanudar") },
    wrapHandler(async (p: { job: string; paused: boolean }, extra) => {
      const ctx = requireCronAdmin(extra?.authInfo as AuthContext, "WRITE");
      if (!getCronJob(p.job)) return fail(`Tarea desconocida: ${p.job}`, { status: 404 });
      return needsConfirmation(await proposeAction(ctx.user.id, "pause_cron", { job: p.job, paused: p.paused }));
    })
  );
}
