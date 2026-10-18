import { data } from "react-router";
import type { CronRun } from "@prisma/client";
import { db } from "./db";
import { authenticateRequest, requireAuth, requireScope } from "./apiAuth";
import { isAdminUser } from "./getters";
import { CRON_JOBS, cronStatus, getCronJob, nextRun, RUNNING_STALE_MS, scheduleWords } from "~/lib/cronJobs";

// Registro de corridas de las rutas /api/cron/*. EasyBits es la fuente de verdad del
// historial sin importar quién dispare (Restate, GitHub Actions o el panel), así que el
// registro vive aquí y no en el disparador.

export type CronTrigger = "restate" | "github" | "manual";
const TRIGGERS: CronTrigger[] = ["restate", "github", "manual"];

export function readTrigger(request: Request): CronTrigger {
  const raw = (request.headers.get("X-Cron-Trigger") || "").trim().toLowerCase();
  return (TRIGGERS as string[]).includes(raw) ? (raw as CronTrigger) : "github";
}

const SUMMARY_MAX = 300;
const ERROR_MAX = 8000;

/** Una línea con el JSON de la respuesta, recortada. Nunca lanza. */
export async function summarize(result: unknown): Promise<{ summary: string | null; status: number }> {
  try {
    let body: unknown = result;
    let status = 200;
    if (result instanceof Response) {
      status = result.status;
      body = await result.clone().text();
    } else if (result && typeof result === "object" && (result as any).type === "DataWithResponseInit") {
      body = (result as any).data;
      status = (result as any).init?.status ?? 200;
    }
    const text = typeof body === "string" ? body : JSON.stringify(body);
    if (text == null) return { summary: null, status };
    const line = text.replace(/\s+/g, " ").trim();
    return { summary: line.length > SUMMARY_MAX ? line.slice(0, SUMMARY_MAX - 1) + "…" : line, status };
  } catch {
    return { summary: null, status: 200 };
  }
}

function errorText(e: unknown): { error: string; status: number } {
  if (e instanceof Response) return { error: `HTTP ${e.status} ${e.statusText}`.trim(), status: e.status };
  if (e && typeof e === "object" && (e as any).type === "DataWithResponseInit") {
    return { error: JSON.stringify((e as any).data).slice(0, ERROR_MAX), status: (e as any).init?.status ?? 500 };
  }
  const err = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e);
  return { error: err.slice(0, ERROR_MAX), status: 500 };
}

// «Ejecutar ahora» espera a que withCronRun registre el inicio (ver startManualRun).
const manualStarted = new Map<string, () => void>();

export async function isCronPaused(job: string): Promise<boolean> {
  const state = await db.cronJobState.findUnique({ where: { job } });
  return !!state?.paused;
}

/**
 * Envuelve el trabajo de una ruta /api/cron/*. Va DESPUÉS del chequeo de CRON_SECRET (una
 * petición sin credencial no deja corrida). En pausa responde `{ skipped: "paused" }` sin
 * correr. Si no, escribe la corrida al empezar y al terminar; si el trabajo lanza, registra
 * el error y relanza: la respuesta de la ruta queda igual que antes.
 */
export async function withCronRun<T>(job: string, request: Request, fn: () => Promise<T>) {
  if (await isCronPaused(job)) return data({ skipped: "paused" as const });

  const trigger = readTrigger(request);
  const startedAt = new Date();
  // Si la base no deja escribir el registro, la tarea corre igual: registrar no puede
  // tumbar una purga o un respaldo.
  const run = await db.cronRun
    .create({ data: { job, trigger, startedAt } })
    .catch((e) => {
      console.error(`[cron] no se pudo registrar el inicio de ${job}:`, e);
      return null;
    });
  manualStarted.get(job)?.();
  const finish = async (fields: Partial<CronRun>) => {
    if (!run) return;
    const finishedAt = new Date();
    await db.cronRun
      .update({
        where: { id: run.id },
        data: { ...fields, finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime() },
      })
      .catch((e) => console.error(`[cron] no se pudo registrar el final de ${job}:`, e));
  };

  try {
    const result = await fn();
    const { summary, status } = await summarize(result);
    await finish({ ok: status < 400, status, summary });
    return result;
  } catch (e) {
    const { error, status } = errorText(e);
    await finish({ ok: false, status, error });
    throw e;
  }
}

// ── Disparo manual ──────────────────────────────────────────────────────────────
// «Ejecutar ahora» llama al MISMO loader de la ruta con una petición sintética, así que
// pasa por su auth, su lógica y withCronRun sin duplicar nada.
type CronLoader = (args: { request: Request; params: object; context: unknown }) => Promise<unknown>;
const ROUTES: Record<string, () => Promise<{ loader: unknown }>> = {
  "backup-agents": () => import("~/routes/api/cron/backup-agents"),
  "backup-machines": () => import("~/routes/api/cron/backup-machines"),
  "prune-backups": () => import("~/routes/api/cron/prune-backups"),
  "expire-work-boxes": () => import("~/routes/api/cron/expire-work-boxes"),
  "check-hosting": () => import("~/routes/api/cron/check-hosting"),
  "dispatch-user-crons": () => import("~/routes/api/cron/dispatch-user-crons"),
  "purge-files": () => import("~/routes/api/cron/purge-files"),
  "purge-keys": () => import("~/routes/api/cron/purge-keys"),
  "purge-machines": () => import("~/routes/api/cron/purge-machines"),
  "purge-notifications": () => import("~/routes/api/cron/purge-notifications"),
  "sweep-fleet-memory": () => import("~/routes/api/cron/sweep-fleet-memory"),
};

export class CronRunError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function runningSince(job: string): Promise<CronRun | null> {
  return db.cronRun.findFirst({
    where: {
      job,
      finishedAt: { isSet: false },
      startedAt: { gt: new Date(Date.now() - RUNNING_STALE_MS) },
    },
    orderBy: { startedAt: "desc" },
  });
}

/** Arranca la tarea en segundo plano con trigger "manual" y vuelve al instante. */
export async function startManualRun(key: string): Promise<{ started: true; job: string }> {
  const route = ROUTES[key];
  if (!getCronJob(key) || !route) throw new CronRunError(`Tarea desconocida: ${key}`, 404);
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new CronRunError("CRON_SECRET no está configurado", 500);
  if (await isCronPaused(key)) throw new CronRunError("La tarea está en pausa", 409);
  if (await runningSince(key)) throw new CronRunError("La tarea ya está corriendo", 409);

  const { loader } = (await route()) as { loader: CronLoader };
  const request = new Request(`http://localhost/api/cron/${key}`, {
    headers: { Authorization: `Bearer ${secret}`, "X-Cron-Trigger": "manual" },
  });
  // Sin esperar el final: el resultado queda en CronRun (withCronRun) y el panel lo ve al
  // sondear. Sí se espera a que la corrida quede REGISTRADA: si no, el panel revalida antes
  // de que exista la fila, no ve nada «corriendo» y no arranca el sondeo.
  const registered = new Promise<void>((resolve) => manualStarted.set(key, resolve));
  const done = Promise.resolve()
    .then(() => loader({ request, params: {}, context: {} }))
    .catch((e) => console.error(`[cron] corrida manual de ${key} falló:`, e instanceof Error ? e.message : e));
  await Promise.race([registered, done, new Promise((r) => setTimeout(r, 5000))]);
  manualStarted.delete(key);
  return { started: true, job: key };
}

export async function setCronPaused(key: string, paused: boolean, by: string | null) {
  if (!getCronJob(key)) throw new CronRunError(`Tarea desconocida: ${key}`, 404);
  return db.cronJobState.upsert({
    where: { job: key },
    create: { job: key, paused, pausedBy: paused ? by : null, pausedAt: paused ? new Date() : null },
    update: { paused, pausedBy: paused ? by : null, pausedAt: paused ? new Date() : null },
  });
}

// ── API de administración ────────────────────────────────────────────────────────
// Scope ADMIN Y superusuario (ADMIN_EMAILS o rol Admin). El scope ADMIN por sí solo no
// basta: cualquier sesión lo tiene sobre SUS recursos, y las tareas son de la plataforma.
export async function requirePlatformAdmin(request: Request) {
  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "ADMIN");
  if (!isAdminUser(ctx.user)) {
    throw Response.json({ error: "Forbidden", reason: "platform_admin_only" }, { status: 403 });
  }
  return ctx;
}

// ── Lectura para el panel y la API ──────────────────────────────────────────────
export type CronRunView = {
  id: string;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  status: number | null;
  durationMs: number | null;
  summary: string | null;
  error: string | null;
  running: boolean;
};

const toView = (r: CronRun, now: number): CronRunView => ({
  id: r.id,
  trigger: r.trigger,
  startedAt: r.startedAt.toISOString(),
  finishedAt: r.finishedAt?.toISOString() ?? null,
  ok: r.ok ?? null,
  status: r.status ?? null,
  durationMs: r.durationMs ?? null,
  summary: r.summary ?? null,
  error: r.error ?? null,
  running: !r.finishedAt && now - r.startedAt.getTime() <= RUNNING_STALE_MS,
});

export async function listCronOverview(now: Date = new Date()) {
  const [states, recent] = await Promise.all([
    db.cronJobState.findMany(),
    Promise.all(
      CRON_JOBS.map((j) =>
        db.cronRun.findMany({
          where: { job: j.key },
          orderBy: { startedAt: "desc" },
          take: 20,
          // El error completo va al panel lateral; aquí sólo pesaría.
          omit: { error: true },
        }),
      ),
    ),
  ]);
  const t = now.getTime();
  return CRON_JOBS.map((j, i) => {
    const state = states.find((s) => s.job === j.key);
    const paused = !!state?.paused;
    const runs = recent[i];
    const last = runs[0] ?? null;
    return {
      ...j,
      schedule: scheduleWords(j.cron, j.timezone),
      status: cronStatus(j.cron, last, paused, now),
      paused,
      pausedBy: state?.pausedBy ?? null,
      pausedAt: state?.pausedAt?.toISOString() ?? null,
      nextRunAt: nextRun(j.cron, now).toISOString(),
      running: runs.some((r) => !r.finishedAt && t - r.startedAt.getTime() <= RUNNING_STALE_MS),
      lastRun: last ? toView({ ...last, error: null }, t) : null,
      // Más vieja a la izquierda, la más reciente a la derecha.
      recent: runs.map((r) => toView({ ...r, error: null }, t)).reverse(),
    };
  });
}

export type CronOverview = Awaited<ReturnType<typeof listCronOverview>>[number];

export async function listCronRuns(key: string, take = 50): Promise<CronRunView[]> {
  const now = Date.now();
  const runs = await db.cronRun.findMany({ where: { job: key }, orderBy: { startedAt: "desc" }, take });
  return runs.map((r) => toView(r, now));
}

/** Retención del historial de corridas (va dentro de purge-notifications). */
export async function purgeOldCronRuns(retentionDays = 90): Promise<{ purged: number }> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const res = await db.cronRun.deleteMany({ where: { startedAt: { lt: cutoff } } });
  return { purged: res.count };
}
