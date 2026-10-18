// Crons de usuario: cada cuenta programa sus propias tareas (pegarle a una URL o mandarle un
// turno a un agente de su flota). Fuente ÚNICA para REST (/api/v2/crons), MCP (create_cron…),
// el panel y las propuestas del copiloto (agentActions).
//
// Cómo corren: la tarea de plataforma `dispatch-user-crons` (cada minuto, la dispara eb-cron)
// llama a `dispatchDueUserCrons`. Cada cron vencido se RECLAMA con un update condicionado a su
// `nextRunAt` actual, así que dos réplicas (azul/verde) o un reintento de Restate no lo corren
// dos veces. Cada corrida queda en `CronRun` con `job = "user:<id>"`.
import { CronExpressionParser } from "cron-parser";
import type { CronRun, User, UserCron } from "@prisma/client";
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { getUserPlan, type PlanKey } from "~/lib/plans";
import { RUNNING_STALE_MS, scheduleWords } from "~/lib/cronJobs";
import { assertPublicUrl, PublicUrlError } from "../publicUrl";
import { getSecretValue } from "./secretOperations";

export const DEFAULT_TIMEZONE = "America/Mexico_City";
/** Lo más seguido que puede correr un cron de usuario. */
export const MIN_INTERVAL_MS = 5 * 60_000;
export const USER_CRON_LIMITS: Record<PlanKey, number> = { Byte: 3, Mega: 20, Tera: 100 };
/** Fallas seguidas tras las que el cron se apaga solo. */
export const MAX_CONSECUTIVE_FAILS = 20;
const HTTP_TIMEOUT_MS = 30_000;
const BODY_MAX = 16_000;
const PROMPT_MAX = 4_000;
const SUMMARY_MAX = 300;
const ERROR_MAX = 4_000;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];

/** Nombre de la llave del copiloto del panel de crons (adminCopilot.ts la mintea con él). */
export const COPILOT_KEY_NAME = "admin-copilot";

export type HttpAction = {
  type: "http";
  url: string;
  method: Method;
  body?: string;
  /** Secreto del vault que viaja como header. */
  secretName?: string;
  /** Header del secreto (default `Authorization`, con `Bearer `). */
  secretHeader?: string;
};
export type AgentTurnAction = { type: "agent_turn"; fleetAgentId: string; prompt: string; groupId?: string };
export type UserCronAction = HttpAction | AgentTurnAction;

export type UserCronInput = {
  name?: string;
  cron?: string;
  timezone?: string;
  enabled?: boolean;
  action?: unknown;
};

const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** Job de `CronRun` de un cron de usuario. */
export const userCronJob = (id: string) => `user:${id}`;

// ── Validación ───────────────────────────────────────────────────────────────────

export function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Cron de 5 campos, zona IANA y no más seguido que cada 5 min (se miran las siguientes 12 corridas). */
export function validateSchedule(cron: string, timezone: string): void {
  const expr = cron.trim();
  if (expr.split(/\s+/).length !== 5) throw bad("cron debe tener 5 campos (min hora día mes díaSemana)");
  if (!validTimezone(timezone)) throw bad(`Zona horaria inválida: ${timezone}`);
  let times: number[];
  try {
    const it = CronExpressionParser.parse(expr, { tz: timezone });
    times = Array.from({ length: 12 }, () => it.next().getTime());
  } catch (e) {
    throw bad(`cron inválido: ${(e as Error).message}`);
  }
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] < MIN_INTERVAL_MS) throw bad("Un cron puede correr como mucho cada 5 minutos");
  }
}

export function nextRunFor(cron: string, timezone: string, from: Date = new Date()): Date {
  return CronExpressionParser.parse(cron.trim(), { currentDate: from, tz: timezone }).next().toDate();
}

/** Normaliza y valida la acción. Comprueba dueño del agente, existencia del secreto y URL pública. */
export async function validateAction(ownerId: string, raw: unknown): Promise<UserCronAction> {
  const a = (raw ?? {}) as Record<string, unknown>;
  if (a.type === "http") {
    const url = String(a.url ?? "").trim();
    try {
      await assertPublicUrl(url);
    } catch (e) {
      throw bad(e instanceof PublicUrlError ? e.message : "URL inválida");
    }
    const method = String(a.method ?? "GET").toUpperCase() as Method;
    if (!METHODS.includes(method)) throw bad(`method debe ser ${METHODS.join(", ")}`);
    const out: HttpAction = { type: "http", url, method };
    if (a.body != null && a.body !== "") {
      const body = typeof a.body === "string" ? a.body : JSON.stringify(a.body);
      if (body.length > BODY_MAX) throw bad("body pasa de 16 KB");
      if (method === "GET") throw bad("Un GET no lleva body");
      out.body = body;
    }
    if (a.secretName) {
      const name = String(a.secretName);
      const exists = await db.secret.findUnique({ where: { userId_name: { userId: ownerId, name } }, select: { id: true } });
      if (!exists) throw bad(`No existe el secreto ${name} en tu vault`);
      out.secretName = name;
      if (a.secretHeader) {
        const h = String(a.secretHeader);
        if (!/^[A-Za-z0-9-]{1,64}$/.test(h) || /^(host|cookie|content-length|transfer-encoding)$/i.test(h)) {
          throw bad("secretHeader inválido");
        }
        out.secretHeader = h;
      }
    }
    return out;
  }
  if (a.type === "agent_turn") {
    const fleetAgentId = String(a.fleetAgentId ?? "");
    if (!/^[a-f0-9]{24}$/.test(fleetAgentId)) throw bad("fleetAgentId inválido");
    const agent = await db.fleetAgent.findFirst({ where: { id: fleetAgentId, ownerId }, select: { id: true } });
    if (!agent) throw bad("Ese agente no existe en tu cuenta", 404);
    const prompt = String(a.prompt ?? "").trim();
    if (!prompt) throw bad("prompt es obligatorio");
    if (prompt.length > PROMPT_MAX) throw bad("prompt pasa de 4000 caracteres");
    const out: AgentTurnAction = { type: "agent_turn", fleetAgentId, prompt };
    if (a.groupId) out.groupId = String(a.groupId).slice(0, 200);
    return out;
  }
  throw bad('action.type debe ser "http" o "agent_turn"');
}

/** Valida una alta completa sin escribir. La usan create y las propuestas del copiloto. */
export async function normalizeCreate(ownerId: string, input: UserCronInput) {
  const name = String(input.name ?? "").trim().slice(0, 80);
  if (!name) throw bad("name es obligatorio");
  const cron = String(input.cron ?? "").trim();
  const timezone = String(input.timezone || DEFAULT_TIMEZONE);
  validateSchedule(cron, timezone);
  const action = await validateAction(ownerId, input.action);
  return { name, cron, timezone, enabled: input.enabled !== false, action };
}

/** Valida un cambio parcial sin escribir. */
export async function normalizeUpdate(current: UserCron, input: UserCronInput) {
  const out: { name?: string; cron?: string; timezone?: string; enabled?: boolean; action?: UserCronAction } = {};
  if (input.name !== undefined) {
    out.name = String(input.name).trim().slice(0, 80);
    if (!out.name) throw bad("name no puede ir vacío");
  }
  if (input.cron !== undefined) out.cron = String(input.cron).trim();
  if (input.timezone !== undefined) out.timezone = String(input.timezone);
  if (out.cron !== undefined || out.timezone !== undefined) {
    validateSchedule(out.cron ?? current.cron, out.timezone ?? current.timezone);
  }
  if (input.enabled !== undefined) out.enabled = !!input.enabled;
  if (input.action !== undefined) out.action = await validateAction(current.ownerId, input.action);
  return out;
}

// ── Lectura ──────────────────────────────────────────────────────────────────────

export type UserCronView = {
  id: string;
  name: string;
  cron: string;
  timezone: string;
  schedule: string;
  enabled: boolean;
  action: UserCronAction;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastOk: boolean | null;
  lastStatus: number | null;
  lastError: string | null;
  failCount: number;
  createdAt: string;
};

export const toUserCronView = (c: UserCron): UserCronView => ({
  id: c.id,
  name: c.name,
  cron: c.cron,
  timezone: c.timezone,
  schedule: scheduleWords(c.cron, c.timezone),
  enabled: c.enabled,
  action: c.action as UserCronAction,
  nextRunAt: c.enabled ? (c.nextRunAt?.toISOString() ?? null) : null,
  lastRunAt: c.lastRunAt?.toISOString() ?? null,
  lastOk: c.lastOk ?? null,
  lastStatus: c.lastStatus ?? null,
  lastError: c.lastError ?? null,
  failCount: c.failCount,
  createdAt: c.createdAt.toISOString(),
});

/** Una línea para tarjetas y listas: «POST https://…» o «turno a <agente>». */
export function describeAction(a: UserCronAction, agentName?: string): string {
  if (a.type === "http") return `${a.method} ${a.url}${a.secretName ? ` (con ${a.secretName})` : ""}`;
  return `turno a ${agentName ? `«${agentName}»` : a.fleetAgentId}: «${a.prompt.slice(0, 80)}${a.prompt.length > 80 ? "…" : ""}»`;
}

async function findOwned(ctx: AuthContext, id: string): Promise<UserCron> {
  if (!/^[a-f0-9]{24}$/.test(id)) throw bad("Cron no encontrado", 404);
  const row = await db.userCron.findFirst({ where: { id, ownerId: ctx.user.id } });
  if (!row) throw bad("Cron no encontrado", 404);
  return row;
}

export async function listUserCrons(ctx: AuthContext): Promise<UserCronView[]> {
  requireScope(ctx, "READ");
  const rows = await db.userCron.findMany({ where: { ownerId: ctx.user.id }, orderBy: { createdAt: "asc" } });
  return rows.map(toUserCronView);
}

/** Agentes del usuario para elegir destino de un `agent_turn` (sólo id y nombre). */
export async function listCronAgentOptions(ctx: AuthContext) {
  requireScope(ctx, "READ");
  return db.fleetAgent.findMany({
    where: { ownerId: ctx.user.id },
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getUserCron(ctx: AuthContext, id: string): Promise<UserCronView> {
  requireScope(ctx, "READ");
  return toUserCronView(await findOwned(ctx, id));
}

export type UserCronRunView = {
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

const runView = (r: CronRun, now = Date.now()): UserCronRunView => ({
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

export async function listUserCronRuns(ctx: AuthContext, id: string, take = 20): Promise<UserCronRunView[]> {
  requireScope(ctx, "READ");
  const c = await findOwned(ctx, id);
  const rows = await db.cronRun.findMany({
    where: { job: userCronJob(c.id) },
    orderBy: { startedAt: "desc" },
    take: Math.min(Math.max(take, 1), 50),
  });
  return rows.map((r) => runView(r));
}

// ── Escritura ────────────────────────────────────────────────────────────────────

/**
 * La llave del copiloto vive dentro de su microVM (un prompt malicioso la puede leer). Con ella
 * los cambios van por propuesta + tarjeta de aprobación, nunca directo por REST/MCP.
 */
function requireHuman(ctx: AuthContext) {
  if (ctx.apiKey?.name === COPILOT_KEY_NAME) {
    throw Response.json(
      { error: "needs_confirmation", message: "Desde el copiloto los cambios a crons se proponen y los aprueba el humano." },
      { status: 403 }
    );
  }
}

export async function createUserCron(ctx: AuthContext, input: UserCronInput): Promise<UserCronView> {
  requireScope(ctx, "WRITE");
  requireHuman(ctx);
  const clean = await normalizeCreate(ctx.user.id, input);
  const plan = getUserPlan(ctx.user);
  const limit = USER_CRON_LIMITS[plan];
  const count = await db.userCron.count({ where: { ownerId: ctx.user.id } });
  if (count >= limit) throw bad(`Tu plan ${plan} permite ${limit} crons; borra uno o sube de plan.`, 403);
  const row = await db.userCron.create({
    data: {
      ownerId: ctx.user.id,
      ...clean,
      nextRunAt: clean.enabled ? nextRunFor(clean.cron, clean.timezone) : null,
    },
  });
  return toUserCronView(row);
}

export async function updateUserCron(ctx: AuthContext, id: string, input: UserCronInput): Promise<UserCronView> {
  requireScope(ctx, "WRITE");
  requireHuman(ctx);
  const current = await findOwned(ctx, id);
  const patch = await normalizeUpdate(current, input);
  const cron = patch.cron ?? current.cron;
  const timezone = patch.timezone ?? current.timezone;
  const enabled = patch.enabled ?? current.enabled;
  const reschedule = patch.cron !== undefined || patch.timezone !== undefined || patch.enabled !== undefined;
  const row = await db.userCron.update({
    where: { id: current.id },
    data: {
      ...patch,
      ...(reschedule ? { nextRunAt: enabled ? nextRunFor(cron, timezone) : null } : {}),
      // Reanudar o cambiar la acción limpia el contador de fallas.
      ...(patch.enabled === true || patch.action ? { failCount: 0 } : {}),
    },
  });
  return toUserCronView(row);
}

export async function deleteUserCron(ctx: AuthContext, id: string): Promise<{ deleted: true; id: string }> {
  requireScope(ctx, "DELETE");
  requireHuman(ctx);
  const current = await findOwned(ctx, id);
  await db.userCron.delete({ where: { id: current.id } });
  return { deleted: true, id: current.id };
}

/** «Ejecutar ahora»: corre en segundo plano con trigger `manual`, sin mover `nextRunAt`. */
export async function runUserCronNow(ctx: AuthContext, id: string): Promise<{ started: true; id: string }> {
  requireScope(ctx, "WRITE");
  requireHuman(ctx);
  const c = await findOwned(ctx, id);
  const running = await db.cronRun.findFirst({
    where: { job: userCronJob(c.id), finishedAt: { isSet: false }, startedAt: { gt: new Date(Date.now() - RUNNING_STALE_MS) } },
    select: { id: true },
  });
  if (running) throw bad("Ese cron ya está corriendo", 409);
  void executeUserCron(c, "manual");
  return { started: true, id: c.id };
}

// ── Ejecución ────────────────────────────────────────────────────────────────────

const clip = (s: string, max: number) => {
  const line = s.replace(/\s+/g, " ").trim();
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
};

type Outcome = { ok: boolean; status: number | null; summary: string | null; error: string | null };

async function runHttp(ownerId: string, a: HttpAction, cronId: string): Promise<Outcome> {
  // Se revalida en cada corrida: el DNS de la URL pudo cambiar desde el alta.
  await assertPublicUrl(a.url);
  const headers: Record<string, string> = {
    "User-Agent": "EasyBits-Cron/1.0 (+https://www.easybits.cloud)",
    "X-Easybits-Cron": cronId,
  };
  if (a.body) headers["Content-Type"] = /^\s*[[{]/.test(a.body) ? "application/json" : "text/plain";
  if (a.secretName) {
    const value = await getSecretValue(ownerId, a.secretName);
    if (value == null) throw new Error(`El secreto ${a.secretName} ya no existe en el vault`);
    const header = a.secretHeader || "Authorization";
    headers[header] = header.toLowerCase() === "authorization" && !/^\w+ /.test(value) ? `Bearer ${value}` : value;
  }
  // Sin seguir redirecciones: una 3xx a una IP interna se saltaría la guarda.
  const res = await fetch(a.url, {
    method: a.method,
    headers,
    body: a.body,
    redirect: "manual",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  const text = await res.text().catch(() => "");
  const ok = res.status < 400;
  return {
    ok,
    status: res.status,
    summary: text ? clip(text, SUMMARY_MAX) : `HTTP ${res.status}`,
    error: ok ? null : clip(`HTTP ${res.status} ${text}`, ERROR_MAX),
  };
}

async function runAgentTurn(ownerId: string, a: AgentTurnAction, cronId: string): Promise<Outcome> {
  const agent = await db.fleetAgent.findFirst({ where: { id: a.fleetAgentId, ownerId }, select: { id: true } });
  if (!agent) throw new Error("El agente ya no existe en tu cuenta");
  const { routeMessage } = await import("./fleetAgentOperations");
  const groupId = a.groupId || `cron:${cronId}`;
  const reply = await routeMessage(a.fleetAgentId, { groupId, text: a.prompt });
  return { ok: true, status: 200, summary: clip(reply || "(sin respuesta)", SUMMARY_MAX), error: null };
}

/** Corre una vez y lo registra en CronRun y en el cron. Nunca lanza. */
export async function executeUserCron(c: UserCron, trigger: "schedule" | "manual"): Promise<Outcome> {
  const startedAt = new Date();
  const run = await db.cronRun
    .create({ data: { job: userCronJob(c.id), trigger, startedAt } })
    .catch((e) => {
      console.error(`[user-cron] no se pudo registrar el inicio de ${c.id}:`, e);
      return null;
    });
  const action = c.action as UserCronAction;
  let out: Outcome;
  try {
    out = action.type === "http" ? await runHttp(c.ownerId, action, c.id) : await runAgentTurn(c.ownerId, action, c.id);
  } catch (e) {
    const msg = e instanceof Error ? `${e.name === "TimeoutError" ? "Timeout: " : ""}${e.message}` : String(e);
    out = { ok: false, status: null, summary: null, error: clip(msg, ERROR_MAX) };
  }
  const finishedAt = new Date();
  if (run) {
    await db.cronRun
      .update({
        where: { id: run.id },
        data: { finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime(), ok: out.ok, status: out.status, summary: out.summary, error: out.error },
      })
      .catch((e) => console.error(`[user-cron] no se pudo registrar el final de ${c.id}:`, e));
  }
  const failCount = out.ok ? 0 : c.failCount + 1;
  const disable = failCount >= MAX_CONSECUTIVE_FAILS;
  await db.userCron
    .update({
      where: { id: c.id },
      data: {
        lastRunAt: startedAt,
        lastOk: out.ok,
        lastStatus: out.status,
        lastError: disable ? `Apagado tras ${failCount} fallas seguidas. Última: ${out.error ?? ""}`.slice(0, ERROR_MAX) : out.error,
        failCount,
        ...(disable ? { enabled: false, nextRunAt: null } : {}),
      },
    })
    // El cron pudo borrarse a media corrida.
    .catch(() => undefined);
  return out;
}

const DISPATCH_BATCH = 200;
/** Cuánto espera el despachador a que terminen las corridas antes de contestar (las demás siguen solas). */
const DISPATCH_WAIT_MS = 45_000;

/**
 * Corre los crons vencidos. Lo llama `/api/cron/dispatch-user-crons` cada minuto. El reclamo es
 * un update condicionado al `nextRunAt` que se leyó: quien gane mueve la fecha; el otro ve 0 filas.
 */
export async function dispatchDueUserCrons(now: Date = new Date()) {
  const due = await db.userCron.findMany({
    where: { enabled: true, nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
    take: DISPATCH_BATCH,
  });
  const started: Promise<Outcome>[] = [];
  let claimed = 0;
  for (const c of due) {
    let next: Date | null;
    try {
      next = nextRunFor(c.cron, c.timezone, now);
    } catch {
      next = null;
    }
    const claim = await db.userCron.updateMany({
      where: { id: c.id, enabled: true, nextRunAt: c.nextRunAt },
      data: next ? { nextRunAt: next } : { nextRunAt: null, enabled: false, lastError: "cron inválido: se apagó" },
    });
    if (claim.count !== 1 || !next) continue;
    claimed++;
    started.push(executeUserCron(c, "schedule"));
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settled = await Promise.race([
    Promise.all(started),
    new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), DISPATCH_WAIT_MS))),
  ]);
  clearTimeout(timer);
  return {
    due: due.length,
    claimed,
    ...(settled ? { ok: settled.filter((o) => o.ok).length, failed: settled.filter((o) => !o.ok).length } : { pending: true }),
  };
}

/** Para las propuestas del copiloto: el usuario completo (plan) a partir del dueño. */
export async function humanCtx(ownerId: string): Promise<AuthContext> {
  const user = (await db.user.findUnique({ where: { id: ownerId } })) as User | null;
  if (!user) throw bad("Usuario no encontrado", 404);
  return { user, scopes: ["ADMIN"] };
}
