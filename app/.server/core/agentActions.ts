// Acciones que un agente PROPONE y un humano aprueba (patrón agent-actions de MailMask).
//
// Tres reglas que hacen que esto sirva de algo:
// - El agente nunca ejecuta: `run_cron`/`pause_cron` sólo crean la fila `pending` y
//   devuelven `needs_confirmation` SIN `isError` (marcado como error, el modelo reintenta).
// - El resumen de la tarjeta se arma desde la base (nombre real de la tarea), nunca con
//   texto del modelo.
// - Aprobar exige la SESIÓN del humano (la ruta no acepta Bearer) y reclama la fila con un
//   update condicionado a `pending`: dos clics o dos pestañas no ejecutan dos veces.
import type { AgentAction } from "@prisma/client";
import { db } from "~/.server/db";
import { setCronPaused, startManualRun } from "~/.server/cron";
import { getCronJob } from "~/lib/cronJobs";
import {
  createUserCron,
  deleteUserCron,
  describeAction,
  describeSchedule,
  humanCtx,
  normalizeCreate,
  normalizeUpdate,
  runUserCronNow,
  updateUserCron,
  type UserCronAction,
} from "./userCronOperations";

export const PENDING_TTL_MS = 15 * 60_000;

export type AgentActionTool = "run_cron" | "pause_cron";
/** Cambios a los crons DEL USUARIO que el copiloto propone (userCronOperations.ts). */
export type UserCronTool = "create_cron" | "update_cron" | "delete_cron" | "run_my_cron";
const USER_CRON_TOOLS: string[] = ["create_cron", "update_cron", "delete_cron", "run_my_cron"];
type Args = { job: string; paused?: boolean };

export class AgentActionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Resumen de la tarjeta desde los datos de la plataforma. Lanza si la tarea no existe. */
export function summarizeAction(tool: AgentActionTool, args: Args): string {
  const job = getCronJob(args.job);
  if (!job) throw new AgentActionError(`Tarea desconocida: ${args.job}`, 404);
  if (tool === "run_cron") return `Ejecutar ahora «${job.name}» (${job.key})`;
  return args.paused ? `Pausar «${job.name}» (${job.key})` : `Reanudar «${job.name}» (${job.key})`;
}

const staleCutoff = (now = Date.now()) => new Date(now - PENDING_TTL_MS);

/** Marca como `expired` las pendientes de más de 15 min del dueño. */
export async function expireStaleActions(ownerId: string, now = Date.now()) {
  await db.agentAction.updateMany({
    where: { ownerId, status: "pending", createdAt: { lte: staleCutoff(now) } },
    data: { status: "expired", resolvedAt: new Date(now) },
  });
}

export type PendingActionView = {
  id: string;
  tool: string;
  args: Args | Record<string, unknown>;
  summary: string;
  createdAt: string;
  expiresAt: string;
};

const view = (a: AgentAction): PendingActionView => ({
  id: a.id,
  tool: a.tool,
  args: a.args as Args,
  summary: a.summary,
  createdAt: a.createdAt.toISOString(),
  expiresAt: new Date(a.createdAt.getTime() + PENDING_TTL_MS).toISOString(),
});

/**
 * Crea (o reusa, si el modelo repite lo mismo) una acción pendiente. Valida la tarea ANTES
 * de guardar: no se archivan propuestas sobre cosas que no existen.
 */
export async function proposeAction(ownerId: string, tool: AgentActionTool, args: Args): Promise<PendingActionView> {
  const clean: Args = tool === "pause_cron" ? { job: args.job, paused: !!args.paused } : { job: args.job };
  const summary = summarizeAction(tool, clean);
  await expireStaleActions(ownerId);
  const open = await db.agentAction.findMany({ where: { ownerId, tool, status: "pending" } });
  const same = open.find((a) => JSON.stringify(a.args) === JSON.stringify(clean));
  if (same) return view(same);
  return view(await db.agentAction.create({ data: { ownerId, tool, args: clean, summary } }));
}

/**
 * Propuesta sobre un cron del usuario. Se valida y normaliza AHORA (lo que se aprueba es lo
 * que se ejecuta) y el resumen sale de esos datos normalizados y de la base, no del modelo.
 */
export async function proposeUserCronAction(
  ownerId: string,
  tool: UserCronTool,
  raw: Record<string, unknown>
): Promise<PendingActionView> {
  let clean: Record<string, unknown>;
  let summary: string;
  const agentName = async (a: UserCronAction | undefined) =>
    a?.type === "agent_turn"
      ? (await db.fleetAgent.findUnique({ where: { id: a.fleetAgentId }, select: { name: true } }))?.name ?? undefined
      : undefined;
  // La propuesta se guarda tal cual en AgentAction: un valor de secreto ahí quedaría en claro.
  if (raw.secretValues) {
    throw new AgentActionError("Los valores de secretos no pasan por el copiloto: súbelos con la CLI o la API (secretValues), o guárdalos en tu bóveda", 400);
  }
  try {
    if (tool === "create_cron") {
      const c = await normalizeCreate(ownerId, raw);
      clean = c;
      summary = `Crear cron «${c.name}» (${describeSchedule(c)}) → ${describeAction(c.action, await agentName(c.action))}`;
    } else {
      const id = String(raw.id ?? "");
      const row = /^[a-f0-9]{24}$/.test(id) ? await db.userCron.findFirst({ where: { id, ownerId } }) : null;
      if (!row) throw new AgentActionError("Cron no encontrado", 404);
      if (tool === "update_cron") {
        const { id: _id, ...patch } = raw;
        const p = await normalizeUpdate(row, patch);
        if (!Object.keys(p).length) throw new AgentActionError("No hay nada que cambiar", 400);
        clean = { id, ...p };
        const parts = [
          p.name !== undefined && `nombre «${p.name}»`,
          (p.cron !== undefined || p.at !== undefined || p.timezone !== undefined || p.until !== undefined || p.timesLeft !== undefined) &&
            `horario ${describeSchedule({ ...row, ...p })}`,
          p.enabled !== undefined && (p.enabled ? "reanudar" : "pausar"),
          p.action && `acción → ${describeAction(p.action, await agentName(p.action))}`,
        ].filter(Boolean);
        summary = `Cambiar cron «${row.name}»: ${parts.join("; ")}`;
      } else {
        clean = { id };
        summary = tool === "delete_cron" ? `Borrar cron «${row.name}»` : `Ejecutar ahora cron «${row.name}»`;
      }
    }
  } catch (e) {
    // Validación (Response 4xx) → error legible para el modelo.
    if (e instanceof Response) {
      const body = (await e.json().catch(() => ({}))) as { error?: string };
      throw new AgentActionError(body.error ?? "Datos inválidos", e.status);
    }
    throw e;
  }
  await expireStaleActions(ownerId);
  const open = await db.agentAction.findMany({ where: { ownerId, tool, status: "pending" } });
  const json = JSON.parse(JSON.stringify(clean));
  const same = open.find((a) => JSON.stringify(a.args) === JSON.stringify(json));
  if (same) return view(same);
  return view(await db.agentAction.create({ data: { ownerId, tool, args: json, summary: summary.slice(0, 500) } }));
}

export async function listPendingActions(ownerId: string): Promise<PendingActionView[]> {
  await expireStaleActions(ownerId);
  const rows = await db.agentAction.findMany({ where: { ownerId, status: "pending" }, orderBy: { createdAt: "asc" } });
  return rows.map(view);
}

/** Pendientes del dueño nacidas desde `since` (para emitir `permission` en un turno). */
export async function pendingActionsSince(ownerId: string, since: Date): Promise<PendingActionView[]> {
  const rows = await db.agentAction.findMany({
    where: { ownerId, status: "pending", createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(view);
}

/** Lo que de verdad corre al aprobar. Única puerta a la ejecución. */
async function execute(a: AgentAction, by: string): Promise<unknown> {
  if (USER_CRON_TOOLS.includes(a.tool)) {
    const { id, ...rest } = a.args as { id?: string } & Record<string, unknown>;
    const ctx = await humanCtx(a.ownerId);
    if (a.tool === "create_cron") return createUserCron(ctx, rest);
    if (a.tool === "update_cron") return updateUserCron(ctx, id!, rest);
    if (a.tool === "delete_cron") return deleteUserCron(ctx, id!);
    return runUserCronNow(ctx, id!);
  }
  const args = a.args as Args;
  if (a.tool === "run_cron") return startManualRun(args.job);
  if (a.tool === "pause_cron") {
    const s = await setCronPaused(args.job, !!args.paused, by);
    return { job: s.job, paused: s.paused, pausedBy: s.pausedBy, pausedAt: s.pausedAt?.toISOString() ?? null };
  }
  throw new AgentActionError(`Acción desconocida: ${a.tool}`, 400);
}

export type ResolveOutcome =
  | { ok: true; status: "executed"; result: unknown }
  | { ok: true; status: "rejected" }
  | { ok: false; status: "failed"; error: string }
  | { ok: false; status: "not_pending"; current: string };

/**
 * Aprueba (y ejecuta) o rechaza. Quien llama YA verificó que hay sesión de superusuario;
 * aquí se exige además que sea el dueño de la propuesta. El reclamo es un update
 * condicionado a `pending` y vigente: el segundo clic encuentra la fila fuera de `pending`.
 */
export async function resolveAgentAction(
  user: { id: string; email: string },
  id: string,
  decision: "approve" | "reject",
  now = Date.now()
): Promise<ResolveOutcome> {
  if (!/^[a-f0-9]{24}$/.test(id)) return { ok: false, status: "not_pending", current: "not_found" };
  await expireStaleActions(user.id, now);
  const claim = await db.agentAction.updateMany({
    where: { id, ownerId: user.id, status: "pending", createdAt: { gt: staleCutoff(now) } },
    data: {
      status: decision === "approve" ? "executing" : "rejected",
      resolvedAt: new Date(now),
      resolvedBy: user.email,
    },
  });
  if (claim.count !== 1) {
    const row = await db.agentAction.findFirst({ where: { id, ownerId: user.id }, select: { status: true } });
    return { ok: false, status: "not_pending", current: row?.status ?? "not_found" };
  }
  if (decision === "reject") return { ok: true, status: "rejected" };
  const row = (await db.agentAction.findUnique({ where: { id } }))!;
  try {
    const result = await execute(row, user.email);
    await db.agentAction.update({ where: { id }, data: { status: "executed", result: JSON.parse(JSON.stringify(result ?? {})) } });
    return { ok: true, status: "executed", result };
  } catch (e) {
    const error =
      e instanceof Response
        ? (((await e.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${e.status}`)
        : e instanceof Error
          ? e.message
          : String(e);
    await db.agentAction.update({ where: { id }, data: { status: "failed", error } }).catch(() => undefined);
    return { ok: false, status: "failed", error };
  }
}
