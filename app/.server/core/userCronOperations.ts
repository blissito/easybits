// Crons de usuario: cada cuenta programa sus propias tareas (pegarle a una URL o mandarle un
// turno a un agente de su flota). Recurrentes (`cron`, que pueden terminar solos con `until` o
// `times`) o de una sola vez (`at`): al correr, éstos se apagan y se quedan en el historial. Fuente ÚNICA para REST (/api/v2/crons), MCP (create_cron…),
// el panel y las propuestas del copiloto (agentActions).
//
// Cómo corren: la tarea de plataforma `dispatch-user-crons` (cada minuto, la dispara eb-cron)
// llama a `dispatchDueUserCrons`. Cada cron vencido se RECLAMA con un update condicionado a su
// `nextRunAt` actual, así que dos réplicas (azul/verde) o un reintento de Restate no lo corren
// dos veces. Cada corrida queda en `CronRun` con `job = "user:<id>"`.
import { CronExpressionParser } from "cron-parser";
import { Prisma, type CronRun, type User, type UserCron } from "@prisma/client";
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { getUserPlan, type PlanKey } from "~/lib/plans";
import { RUNNING_STALE_MS, scheduleWords } from "~/lib/cronJobs";
import { assertPublicUrl, PublicUrlError } from "../publicUrl";
import { createSecret, getSecretValue } from "./secretOperations";
import { dispatchWebhooks } from "../webhooks";
import { sendTransactional } from "../emails/sendTransactional";
import { appendInboxEvent, ownedInbox } from "./inboxOperations";

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
/** Un archivo que se monta en la caja antes de correr. `path` relativo = dentro del directorio de trabajo. */
export type ExecFile = { path: string; content: string; encoding?: "utf8" | "base64" };
/**
 * Un secreto para el comando: como variable de entorno (`NAME`) o, con `file`, como archivo en esa
 * ruta (para un .p8). Se busca primero el del cron (`NAME__C_<id>`, subido con `secretValues`) y
 * luego el de la bóveda de la cuenta.
 */
export type ExecSecret = { name: string; file?: string };
export type ExecAction = {
  type: "exec";
  command: string;
  files?: ExecFile[];
  secrets?: ExecSecret[];
  template?: ExecTemplate;
  timeoutSeconds?: number;
};
export type UserCronAction = HttpAction | AgentTurnAction | ExecAction;

export const EXEC_TEMPLATES = ["python", "node", "bun", "ubuntu"] as const;
export type ExecTemplate = (typeof EXEC_TEMPLATES)[number];
export const EXEC_DEFAULT_TIMEOUT_S = 300;
/** Lo que acepta `exec` del host por llamada. */
export const EXEC_MAX_TIMEOUT_S = 600;
const EXEC_COMMAND_MAX = 8_000;
const EXEC_FILES_MAX = 20;
const EXEC_FILES_BYTES_MAX = 512 * 1024;
const EXEC_SECRETS_MAX = 20;
/** Cola de stdout+stderr que se guarda por corrida. */
export const LOGS_MAX = 64 * 1024;
/** Directorio de trabajo del comando dentro de la caja. */
export const EXEC_WORKDIR = "/root/job";

export type UserCronInput = {
  name?: string;
  cron?: string;
  /** Una sola vez: ISO (sin zona se lee en `timezone`) o «23:00» (hoy en `timezone`). */
  at?: string | Date | null;
  /** Una sola vez, relativo: «2h», «90m», «1h30m», «1d». */
  in?: string;
  /** Recurrente que termina solo: última fecha (misma forma que `at`). null lo quita. */
  until?: string | Date | null;
  /** Recurrente que termina solo: cuántas corridas más. null lo quita. */
  times?: number | null;
  /**
   * Valores de secretos acotados a ESTE cron (`{ NOMBRE: valor }`): se guardan como
   * `NOMBRE__C_<id>`, ningún otro cron los lee y se borran con el cron. Nunca regresan.
   */
  secretValues?: Record<string, string>;
  /** Avisos por corrida; null los quita. */
  notify?: unknown;
  /** Igual que `times` (es como se guarda; las propuestas del copiloto lo traen así). */
  timesLeft?: number | null;
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

/** Lo más lejos que se puede programar algo de una sola vez. */
export const MAX_AT_AHEAD_MS = 366 * 24 * 3600_000;

/** Desfase de `tz` respecto a UTC en el instante `t` (ms). */
function tzOffsetMs(t: number, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(t / 1000) * 1000;
}

/** Hora de pared en `tz` → instante. Dos pasadas por si el desfase cambia (horario de verano). */
function zonedTime(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = wall - tzOffsetMs(wall, tz);
  t = wall - tzOffsetMs(t, tz);
  return new Date(t);
}

/** «2026-10-18 23:00» en la zona dada. */
export function formatLocal(d: Date, tz: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Cuánto falta, corto: «12h 54m», «3d 2h», «40s». */
export function humanIn(ms: number): string {
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))}s`;
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h) return mm ? `${h}h ${mm}m` : `${h}h`;
  return `${mm}m`;
}

/** «2h», «90m», «1h30m», «1d», «45s» → ms. null si no se entiende. */
export function parseDuration(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!/^(\d+(d|h|m|min|s))+$/.test(s)) return null;
  let ms = 0;
  for (const [, n, u] of s.matchAll(/(\d+)(d|h|min|m|s)/g)) {
    ms += Number(n) * (u === "d" ? 86_400_000 : u === "h" ? 3_600_000 : u === "s" ? 1000 : 60_000);
  }
  return ms;
}

/**
 * Una fecha de `at`/`until`: Date, ISO con zona (`Z`, `-06:00`), ISO sin zona (se lee en `tz`) o
 * «HH:MM» (hoy en `tz`). No adivina «mañana»: una hora que ya pasó se rechaza al validar.
 */
export function parseWhen(raw: string | Date, tz: string, now: Date = new Date()): Date {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) throw bad("Fecha inválida");
    return raw;
  }
  const s = String(raw).trim();
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const [y, mo, d] = formatLocal(now, tz).slice(0, 10).split("-").map(Number);
    if (+m[1] > 23 || +m[2] > 59) throw bad(`Hora inválida: ${s}`);
    return zonedTime(y, mo, d, +m[1], +m[2], 0, tz);
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return zonedTime(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), tz);
  if (/^\d{4}-\d{2}-\d{2}T.+(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw bad(`Fecha inválida: «${s}». Usa ISO (2026-10-18T23:00, se lee en la zona del cron) o «23:00» (hoy).`);
}

/** `at` válido: en el futuro y a no más de un año. */
export function validateAt(at: Date, tz: string, now: Date = new Date()): void {
  if (at.getTime() <= now.getTime()) {
    throw bad(`at ya pasó: ${formatLocal(at, tz)} (${tz}). Ahora son las ${formatLocal(now, tz)}.`);
  }
  if (at.getTime() - now.getTime() > MAX_AT_AHEAD_MS) throw bad("at puede estar a lo más a un año");
}

export type Schedule = { cron: string; at: Date | null; until: Date | null; timesLeft: number | null; timezone: string };

/** Las próximas `n` corridas (respeta `until` y `timesLeft`). */
export function upcomingRuns(s: Schedule, n = 3, from: Date = new Date()): Date[] {
  if (s.at) return s.at > from ? [s.at] : [];
  const out: Date[] = [];
  const max = s.timesLeft == null ? n : Math.min(n, s.timesLeft);
  const it = CronExpressionParser.parse(s.cron.trim(), { currentDate: from, tz: s.timezone });
  while (out.length < max) {
    const t = it.next().toDate();
    if (s.until && t > s.until) break;
    out.push(t);
  }
  return out;
}

/**
 * Qué escribe el reclamo de una corrida programada: la siguiente fecha, o apagarlo si era de una
 * sola vez o se le acabaron `until`/`times`. `run:false` = no correr (cron inválido). Puro, con test.
 */
export function claimData(c: Pick<UserCron, "cron" | "at" | "until" | "timesLeft" | "timezone">, now: Date) {
  if (c.at) return { run: true, data: { nextRunAt: null, enabled: false } };
  let next: Date;
  try {
    next = nextRunFor(c.cron, c.timezone, now);
  } catch {
    return { run: false, data: { nextRunAt: null, enabled: false, lastError: "cron inválido: se apagó" } };
  }
  const timesLeft = c.timesLeft == null ? null : Math.max(c.timesLeft - 1, 0);
  const over = timesLeft === 0 || (c.until != null && next > c.until);
  return {
    run: true,
    data: {
      ...(timesLeft != null ? { timesLeft } : {}),
      ...(over ? { nextRunAt: null, enabled: false } : { nextRunAt: next }),
    },
  };
}

/** Normaliza y valida la acción. Comprueba dueño del agente, existencia del secreto y URL pública. */
export async function validateAction(ownerId: string, raw: unknown, input?: { secretValues?: Record<string, string> }): Promise<UserCronAction> {
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
      if (isScopedName(name)) throw bad(`No existe el secreto ${name} en tu vault`);
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
  if (a.type === "exec") return validateExec(ownerId, a, input?.secretValues);
  throw bad('action.type debe ser "http", "agent_turn" o "exec"');
}

/**
 * Avisos por corrida. `push` va a la app de Ghosty (POST /api/v2/me/push de ghosty.studio) con el
 * token personal `gpu_…` del secreto `GHOSTY_PUSH_TOKEN` (o el que diga `secret`). `email` sólo
 * al correo de la cuenta dueña: con una dirección libre, un cron sería un relevo de spam.
 */
export type CronNotify = { on: "failure" | "always"; push?: { secret: string }; email?: true; inbox?: string };
export const DEFAULT_PUSH_SECRET = "GHOSTY_PUSH_TOKEN";
export const GHOSTY_PUSH_URL = process.env.GHOSTY_PUSH_URL || "https://www.ghosty.studio/api/v2/me/push";

export async function validateNotify(ownerId: string, raw: unknown): Promise<CronNotify | null> {
  if (raw == null) return null;
  const n = raw as Record<string, unknown>;
  const on = n.on == null ? "failure" : String(n.on);
  if (on !== "failure" && on !== "always") throw bad('notify.on debe ser "failure" o "always"');
  const out: CronNotify = { on };
  if (n.push) {
    const secret = typeof n.push === "object" && (n.push as { secret?: unknown }).secret ? String((n.push as { secret: unknown }).secret) : DEFAULT_PUSH_SECRET;
    if (!SECRET_NAME.test(secret) || isScopedName(secret)) throw bad(`notify.push.secret inválido: «${secret}»`);
    const exists = await db.secret.findUnique({ where: { userId_name: { userId: ownerId, name: secret } }, select: { id: true } });
    if (!exists) {
      throw bad(`Para avisos push falta el secreto ${secret} en tu bóveda: saca un token personal en la app de Ghosty (Ajustes → Avisos) y guárdalo con ese nombre`);
    }
    out.push = { secret };
  }
  if (n.email) out.email = true;
  if (n.inbox) {
    const box = await ownedInbox(ownerId, String(n.inbox));
    if (!box) throw bad("notify.inbox: ese buzón no existe en tu cuenta (usa su id)");
    out.inbox = box.id;
  }
  if (!out.push && !out.email && !out.inbox) throw bad("notify necesita push, email o inbox");
  return out;
}

/** Sufijo de los secretos acotados a un cron. */
export const cronSecretName = (cronId: string, name: string) => `${name}__C_${cronId.toUpperCase()}`;
/** Un nombre «acotado» (de un cron o de una máquina) no se puede pedir por su nombre guardado. */
const isScopedName = (name: string) => /__[CM]_[A-Z0-9]+$/.test(name);
const SECRET_NAME = /^[A-Z_][A-Z0-9_]*$/;

/** Ruta en la caja: `~/x` bajo /root, relativa bajo el directorio de trabajo; sin `..`. */
export function boxPath(p: string): string {
  const raw = String(p ?? "").trim();
  if (!raw || raw.length > 300 || raw.split("/").includes("..") || /[\0\n]/.test(raw)) throw bad(`Ruta inválida: «${raw}»`);
  if (raw.startsWith("~/")) return `/root/${raw.slice(2)}`;
  if (raw.startsWith("/")) return raw;
  return `${EXEC_WORKDIR}/${raw.replace(/^\.\//, "")}`;
}

async function validateExec(ownerId: string, a: Record<string, unknown>, secretValues?: Record<string, string>): Promise<ExecAction> {
  const command = String(a.command ?? "").trim();
  if (!command) throw bad("command es obligatorio");
  if (command.length > EXEC_COMMAND_MAX) throw bad("command pasa de 8000 caracteres");
  const out: ExecAction = { type: "exec", command };
  const template = String(a.template ?? "python") as ExecTemplate;
  if (!EXEC_TEMPLATES.includes(template)) throw bad(`template debe ser ${EXEC_TEMPLATES.join(", ")}`);
  out.template = template;
  const timeout = a.timeoutSeconds == null ? EXEC_DEFAULT_TIMEOUT_S : Number(a.timeoutSeconds);
  if (!Number.isInteger(timeout) || timeout < 10 || timeout > EXEC_MAX_TIMEOUT_S) throw bad(`timeoutSeconds entre 10 y ${EXEC_MAX_TIMEOUT_S}`);
  out.timeoutSeconds = timeout;
  if (a.files != null) {
    if (!Array.isArray(a.files) || a.files.length > EXEC_FILES_MAX) throw bad(`files: hasta ${EXEC_FILES_MAX} archivos`);
    let bytes = 0;
    out.files = a.files.map((f: any) => {
      const encoding = f?.encoding === "base64" ? "base64" : "utf8";
      const content = String(f?.content ?? "");
      bytes += encoding === "base64" ? Math.floor((content.length * 3) / 4) : Buffer.byteLength(content);
      boxPath(f?.path);
      return { path: String(f.path).trim(), content, ...(encoding === "base64" ? { encoding } : {}) };
    });
    if (bytes > EXEC_FILES_BYTES_MAX) throw bad("files pasa de 512 KB en total");
  }
  if (a.secrets != null) {
    if (!Array.isArray(a.secrets) || a.secrets.length > EXEC_SECRETS_MAX) throw bad(`secrets: hasta ${EXEC_SECRETS_MAX}`);
    out.secrets = [];
    for (const raw of a.secrets as any[]) {
      const sec = typeof raw === "string" ? { name: raw } : raw;
      const name = String(sec?.name ?? "");
      if (!SECRET_NAME.test(name) || isScopedName(name)) throw bad(`Nombre de secreto inválido: «${name}»`);
      const given = secretValues && Object.prototype.hasOwnProperty.call(secretValues, name);
      if (!given) {
        // Sin valor nuevo vale el de la bóveda o uno ya acotado a este cron (se resuelve al correr).
        const vault = await db.secret.findFirst({
          where: { userId: ownerId, OR: [{ name }, { name: { startsWith: `${name}__C_` } }] },
          select: { id: true },
        });
        if (!vault) throw bad(`No existe el secreto ${name}: súbelo con secretValues (o --secret-file) o guárdalo en tu bóveda`);
      }
      out.secrets.push(sec.file ? { name, file: (boxPath(sec.file), String(sec.file).trim()) } : { name });
    }
  }
  return out;
}

/** Guarda los `secretValues` como secretos de ESTE cron (sólo los que su acción usa). */
async function storeCronSecrets(ownerId: string, cronId: string, action: UserCronAction, values?: Record<string, string>) {
  if (!values || action.type !== "exec") return;
  const used = new Set((action.secrets ?? []).map((s) => s.name));
  for (const [name, value] of Object.entries(values)) {
    if (!used.has(name)) throw bad(`secretValues.${name} no lo usa la acción (agrégalo a action.secrets)`);
    if (typeof value !== "string" || !value) throw bad(`secretValues.${name} vacío`);
    if (value.length > 64 * 1024) throw bad(`secretValues.${name} pasa de 64 KB`);
    await createSecret(ownerId, { name: cronSecretName(cronId, name), value });
  }
}

/**
 * Horario de un alta o de un cambio ya mezclado con lo actual: exactamente uno de `cron` o `at`
 * (o `in`), y `until`/`times` sólo con `cron`.
 */
function resolveSchedule(
  input: { cron?: string; at?: string | Date | null; in?: string; until?: string | Date | null; times?: number | null },
  timezone: string,
  now: Date
): Omit<Schedule, "timezone"> {
  if (!validTimezone(timezone)) throw bad(`Zona horaria inválida: ${timezone}`);
  const cron = String(input.cron ?? "").trim();
  let at: Date | null = null;
  if (input.in != null && input.in !== "") {
    if (input.at) throw bad("Usa at o in, no los dos");
    const ms = parseDuration(String(input.in));
    if (ms == null) throw bad(`in inválido: «${input.in}». Ejemplos: 10m, 2h, 1h30m, 1d`);
    at = new Date(now.getTime() + ms);
  } else if (input.at) {
    at = parseWhen(input.at, timezone, now);
  }
  if (at && cron) throw bad("Un cron lleva `cron` (se repite) o `at` (una sola vez), no los dos");
  if (!at && !cron) throw bad("Falta el horario: `cron` (se repite) o `at`/`in` (una sola vez)");
  const until = input.until ? parseWhen(input.until, timezone, now) : null;
  const timesLeft = input.times == null ? null : Number(input.times);
  if (at) {
    if (until || timesLeft != null) throw bad("until y times son para crons que se repiten; uno con at corre una sola vez");
    validateAt(at, timezone, now);
    return { cron: "", at, until: null, timesLeft: null };
  }
  validateSchedule(cron, timezone);
  if (timesLeft != null && (!Number.isInteger(timesLeft) || timesLeft < 1 || timesLeft > 10_000)) {
    throw bad("times debe ser un entero entre 1 y 10000");
  }
  if (until && until <= nextRunFor(cron, timezone, now)) {
    throw bad(`until (${formatLocal(until, timezone)}) llega antes de la primera corrida: nunca correría`);
  }
  return { cron, at: null, until, timesLeft };
}

/** Valida una alta completa sin escribir. La usan create, dryRun y las propuestas del copiloto. */
export async function normalizeCreate(ownerId: string, input: UserCronInput, now: Date = new Date()) {
  if (input.times === undefined && input.timesLeft !== undefined) input = { ...input, times: input.timesLeft };
  const name = String(input.name ?? "").trim().slice(0, 80);
  if (!name) throw bad("name es obligatorio");
  const timezone = String(input.timezone || DEFAULT_TIMEZONE);
  const sched = resolveSchedule(input, timezone, now);
  const action = await validateAction(ownerId, input.action, input);
  const notify = await validateNotify(ownerId, input.notify);
  return { name, ...sched, timezone, enabled: input.enabled !== false, action, ...(notify ? { notify } : {}) };
}

type SchedulePatch = { cron?: string; at?: Date | null; until?: Date | null; timesLeft?: number | null; timezone?: string };

/** Valida un cambio parcial sin escribir. */
export async function normalizeUpdate(current: UserCron, input: UserCronInput, now: Date = new Date()) {
  if (input.times === undefined && input.timesLeft !== undefined) input = { ...input, times: input.timesLeft };
  const out: { name?: string; enabled?: boolean; action?: UserCronAction; notify?: CronNotify | null } & SchedulePatch = {};
  if (input.name !== undefined) {
    out.name = String(input.name).trim().slice(0, 80);
    if (!out.name) throw bad("name no puede ir vacío");
  }
  const touches = ["cron", "at", "in", "until", "times", "timezone"].some((k) => (input as Record<string, unknown>)[k] !== undefined);
  if (touches) {
    const timezone = String(input.timezone ?? current.timezone);
    // Pasar a `at`/`in` deja el cron vacío y viceversa; lo que no venga se queda como estaba.
    if ((input.at || input.in) && input.cron) throw bad("Un cron lleva `cron` (se repite) o `at` (una sola vez), no los dos");
    const switching = input.at || input.in ? "at" : input.cron ? "cron" : null;
    const pick = <T,>(given: T | undefined, kept: T, cleared: T) => (given !== undefined ? given : switching === "at" ? cleared : kept);
    const merged = {
      cron: switching === "at" ? "" : (input.cron ?? current.cron),
      at: switching === "cron" ? null : input.at !== undefined || input.in !== undefined ? input.at : current.at,
      in: input.in,
      until: pick(input.until, current.until as Date | string | null, null),
      times: pick(input.times, current.timesLeft, null),
    };
    // Un `at` que ya corrió y no se toca no se revalida contra «ahora» (sólo si se reanuda; abajo).
    const keepPastAt = !switching && merged.at && !input.at && current.at && current.at <= now;
    const sched = keepPastAt
      ? { cron: "", at: current.at, until: null, timesLeft: null }
      : resolveSchedule(merged, timezone, now);
    Object.assign(out, sched, { timezone });
  }
  if (input.enabled !== undefined) out.enabled = !!input.enabled;
  const at = out.at !== undefined ? out.at : current.at;
  if (out.enabled === true && at && at <= now) {
    throw bad("Ese cron de una sola vez ya pasó; dale otro `at` (o `in`) para volver a programarlo");
  }
  if (out.enabled === true && !at) {
    const timesLeft = out.timesLeft !== undefined ? out.timesLeft : current.timesLeft;
    const until = out.until !== undefined ? out.until : current.until;
    if (timesLeft === 0) throw bad("A ese cron ya no le quedan corridas; dale `times` nuevo (o null para siempre)");
    if (until && until <= now) throw bad("La fecha `until` de ese cron ya pasó; dale otra (o null para siempre)");
  }
  if (input.notify !== undefined) out.notify = await validateNotify(current.ownerId, input.notify);
  if (input.action !== undefined) out.action = await validateAction(current.ownerId, input.action, input);
  else if (input.secretValues) throw bad("secretValues va junto con action (la acción dice qué secretos usa)");
  return out;
}

// ── Lectura ──────────────────────────────────────────────────────────────────────

export type UserCronView = {
  id: string;
  name: string;
  /** "once" (`at`) o "recurring" (`cron`). */
  kind: "once" | "recurring";
  cron: string;
  at: string | null;
  until: string | null;
  timesLeft: number | null;
  timezone: string;
  schedule: string;
  enabled: boolean;
  /** Ya hizo todo lo que tenía que hacer (de una sola vez que corrió, o se le acabaron until/times). */
  done: boolean;
  action: UserCronAction;
  notify: CronNotify | null;
  nextRunAt: string | null;
  /** `nextRunAt` en la zona del cron: «2026-10-18 23:00». */
  nextRunLocal: string | null;
  /** Cuánto falta: «12h 54m». */
  in: string | null;
  lastRunAt: string | null;
  lastOk: boolean | null;
  lastStatus: number | null;
  lastError: string | null;
  failCount: number;
  createdAt: string;
};

/** Horario en palabras, también para los de una sola vez y los que terminan solos. */
export function describeSchedule(c: Pick<UserCron, "cron" | "at" | "until" | "timesLeft" | "timezone">): string {
  if (c.at) return `una vez, ${formatLocal(c.at, c.timezone)} ${c.timezone}`;
  const base = scheduleWords(c.cron, c.timezone);
  const ends = [
    c.until && `hasta ${formatLocal(c.until, c.timezone)}`,
    c.timesLeft != null && `${c.timesLeft} ${c.timesLeft === 1 ? "vez" : "veces"} más`,
  ].filter(Boolean);
  return ends.length ? `${base} · ${ends.join(" · ")}` : base;
}

export const isDone = (c: Pick<UserCron, "enabled" | "at" | "until" | "timesLeft">, now = new Date()) =>
  !c.enabled && ((c.at != null && c.at <= now) || c.timesLeft === 0 || (c.until != null && c.until <= now));

/** La acción como se muestra: los archivos sin su contenido (sólo ruta y tamaño). */
export function publicAction(a: UserCronAction): UserCronAction {
  if (a.type !== "exec" || !a.files) return a;
  return {
    ...a,
    files: a.files.map((f) => ({ path: f.path, bytes: f.encoding === "base64" ? Math.floor((f.content.length * 3) / 4) : Buffer.byteLength(f.content) })) as unknown as ExecFile[],
  };
}

export const toUserCronView = (c: UserCron, now = new Date()): UserCronView => {
  const next = c.enabled ? c.nextRunAt : null;
  return {
    id: c.id,
    name: c.name,
    kind: c.at ? "once" : "recurring",
    cron: c.cron,
    at: c.at?.toISOString() ?? null,
    until: c.until?.toISOString() ?? null,
    timesLeft: c.timesLeft ?? null,
    timezone: c.timezone,
    schedule: describeSchedule(c),
    enabled: c.enabled,
    done: isDone(c, now),
    action: publicAction(c.action as UserCronAction),
    notify: (c.notify as CronNotify | null) ?? null,
    nextRunAt: next?.toISOString() ?? null,
    nextRunLocal: next ? formatLocal(next, c.timezone) : null,
    in: next ? humanIn(next.getTime() - now.getTime()) : null,
    lastRunAt: c.lastRunAt?.toISOString() ?? null,
    lastOk: c.lastOk ?? null,
    lastStatus: c.lastStatus ?? null,
    lastError: c.lastError ?? null,
    failCount: c.failCount,
    createdAt: c.createdAt.toISOString(),
  };
};

/** Una línea para tarjetas y listas: «POST https://…» o «turno a <agente>». */
export function describeAction(a: UserCronAction, agentName?: string): string {
  if (a.type === "http") return `${a.method} ${a.url}${a.secretName ? ` (con ${a.secretName})` : ""}`;
  if (a.type === "exec") {
    const extra = [a.files?.length && `${a.files.length} archivo(s)`, a.secrets?.length && `secretos ${a.secrets.map((x) => x.name).join(", ")}`].filter(Boolean);
    return `ejecutar «${a.command.slice(0, 80)}${a.command.length > 80 ? "…" : ""}» en ${a.template ?? "python"}${extra.length ? ` (${extra.join("; ")})` : ""}`;
  }
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
  return rows.map((r) => toUserCronView(r));
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
  /** Corridas `exec`: código de salida del comando. */
  exitCode: number | null;
  /** Corridas `exec`, sólo si se piden (`logs:true`): cola de stdout+stderr (64 KB). */
  logs?: string | null;
  running: boolean;
};

const runView = (r: CronRun, now = Date.now(), withLogs = false): UserCronRunView => ({
  id: r.id,
  trigger: r.trigger,
  startedAt: r.startedAt.toISOString(),
  finishedAt: r.finishedAt?.toISOString() ?? null,
  ok: r.ok ?? null,
  status: r.status ?? null,
  durationMs: r.durationMs ?? null,
  summary: r.summary ?? null,
  error: r.error ?? null,
  exitCode: r.exitCode ?? null,
  ...(withLogs ? { logs: r.logs ?? null } : {}),
  running: !r.finishedAt && now - r.startedAt.getTime() <= RUNNING_STALE_MS,
});

export async function listUserCronRuns(ctx: AuthContext, id: string, take = 20, opts: { logs?: boolean } = {}): Promise<UserCronRunView[]> {
  requireScope(ctx, "READ");
  const c = await findOwned(ctx, id);
  const rows = await db.cronRun.findMany({
    where: { job: userCronJob(c.id) },
    orderBy: { startedAt: "desc" },
    take: Math.min(Math.max(take, 1), 50),
  });
  return rows.map((r) => runView(r, Date.now(), opts.logs));
}

/** Lo más que una llamada de `wait` mantiene la conexión abierta (long-poll detrás de Caddy). */
export const WAIT_MAX_S = 50;
const WAIT_POLL_MS = 2_000;
/** Cuánto se espera a que aparezca la corrida de un cron recién reclamado antes de dar 409. */
const CLAIM_GRACE_MS = 30_000;

export type UserCronWait = {
  /** La corrida que terminó (con `logs`), o null si se acabó el tiempo de esta llamada. */
  run: UserCronRunView | null;
  /** Desde cuándo se espera: pásalo en la siguiente llamada para no perder la corrida. */
  after: string;
  running: boolean;
  nextRunAt: string | null;
  nextRunLocal: string | null;
};

/**
 * Espera la siguiente corrida que TERMINE a partir de `after` (default: la que va en curso o, si
 * no hay, ahora). 409 si no hay nada que esperar: apagado, sin corrida en curso ni próxima.
 */
export async function waitUserCronRun(
  ctx: AuthContext,
  id: string,
  opts: { after?: string | Date; waitS?: number; sleep?: (ms: number) => Promise<void> } = {}
): Promise<UserCronWait> {
  requireScope(ctx, "READ");
  const c = await findOwned(ctx, id);
  const job = userCronJob(c.id);
  const fresh = () => new Date(Date.now() - RUNNING_STALE_MS);
  const inFlight = await db.cronRun.findFirst({
    where: { job, finishedAt: { isSet: false }, startedAt: { gt: fresh() } },
    orderBy: { startedAt: "asc" },
  });
  let after: Date;
  if (opts.after) {
    after = new Date(opts.after);
    if (Number.isNaN(after.getTime())) throw bad("after inválido");
  } else after = inFlight?.startedAt ?? new Date();
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const deadline = Date.now() + Math.min(Math.max(opts.waitS ?? WAIT_MAX_S, 0), WAIT_MAX_S) * 1000;
  for (;;) {
    const done = await db.cronRun.findFirst({
      where: { job, startedAt: { gte: after }, finishedAt: { isSet: true } },
      orderBy: { startedAt: "asc" },
    });
    const cur = await db.userCron.findUnique({ where: { id: c.id } });
    const next = cur?.enabled ? cur.nextRunAt : null;
    const base = {
      after: after.toISOString(),
      nextRunAt: next?.toISOString() ?? null,
      nextRunLocal: next ? formatLocal(next, c.timezone) : null,
    };
    if (done) return { run: runView(done, Date.now(), true), running: false, ...base };
    const running = !!(await db.cronRun.findFirst({
      where: { job, startedAt: { gte: after }, finishedAt: { isSet: false } },
      select: { id: true },
    })) || !!(inFlight && inFlight.startedAt >= after);
    // El despachador reclama un cron de una sola vez (lo apaga, sin nextRunAt) un instante ANTES
    // de crear su CronRun: si el cron se movió hace poco, la corrida viene en camino.
    const justClaimed = !!cur && Date.now() - cur.updatedAt.getTime() < CLAIM_GRACE_MS;
    if (!running && !next && !justClaimed) throw bad("No hay corrida por esperar: el cron está apagado o ya terminó y no corre nada", 409);
    if (Date.now() >= deadline) return { run: null, running, ...base };
    await sleep(Math.min(WAIT_POLL_MS, Math.max(deadline - Date.now(), 0)));
  }
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

/** Crons que ocupan lugar del plan: los de una sola vez que ya corrieron no cuentan (son historial). */
async function countActive(ownerId: string, now = new Date()) {
  const [all, done] = await Promise.all([
    db.userCron.count({ where: { ownerId } }),
    db.userCron.count({ where: { ownerId, enabled: false, at: { lte: now } } }),
  ]);
  return all - done;
}

export type UserCronPreview = {
  dryRun: true;
  name: string;
  kind: "once" | "recurring";
  schedule: string;
  timezone: string;
  /** Las próximas (hasta 3) en ISO y en la zona del cron. */
  nextRuns: { at: string; local: string }[];
  in: string | null;
  action: UserCronAction;
};

/** `dryRun`: valida todo (horario, acción, cupo) sin escribir y dice cuándo correría. */
export async function previewUserCron(ctx: AuthContext, input: UserCronInput, now = new Date()): Promise<UserCronPreview> {
  requireScope(ctx, "READ");
  const clean = await normalizeCreate(ctx.user.id, input, now);
  const runs = upcomingRuns(clean, 3, now);
  return {
    dryRun: true,
    name: clean.name,
    kind: clean.at ? "once" : "recurring",
    schedule: describeSchedule(clean),
    timezone: clean.timezone,
    nextRuns: runs.map((d) => ({ at: d.toISOString(), local: formatLocal(d, clean.timezone) })),
    in: runs[0] ? humanIn(runs[0].getTime() - now.getTime()) : null,
    action: publicAction(clean.action),
  };
}

export async function createUserCron(ctx: AuthContext, input: UserCronInput & { dryRun?: boolean }): Promise<UserCronView | UserCronPreview> {
  if (input.dryRun) return previewUserCron(ctx, input);
  requireScope(ctx, "WRITE");
  requireHuman(ctx);
  const clean = await normalizeCreate(ctx.user.id, input);
  const plan = getUserPlan(ctx.user);
  const limit = USER_CRON_LIMITS[plan];
  if ((await countActive(ctx.user.id)) >= limit) throw bad(`Tu plan ${plan} permite ${limit} crons; borra uno o sube de plan.`, 403);
  const row = await db.userCron.create({
    data: {
      ownerId: ctx.user.id,
      ...clean,
      nextRunAt: clean.enabled ? (clean.at ?? nextRunFor(clean.cron, clean.timezone)) : null,
    },
  });
  try {
    await storeCronSecrets(ctx.user.id, row.id, clean.action, input.secretValues);
  } catch (e) {
    // Sin sus secretos el cron no sirve: se deshace el alta.
    await db.userCron.delete({ where: { id: row.id } }).catch(() => undefined);
    throw e;
  }
  return toUserCronView(row);
}

export async function updateUserCron(ctx: AuthContext, id: string, input: UserCronInput): Promise<UserCronView> {
  requireScope(ctx, "WRITE");
  requireHuman(ctx);
  const current = await findOwned(ctx, id);
  const patch = await normalizeUpdate(current, input);
  if (patch.action) await storeCronSecrets(current.ownerId, current.id, patch.action, input.secretValues);
  const cron = patch.cron ?? current.cron;
  const at = patch.at !== undefined ? patch.at : current.at;
  const timezone = patch.timezone ?? current.timezone;
  const enabled = patch.enabled ?? current.enabled;
  const reschedule = ["cron", "at", "timezone", "enabled"].some((k) => (patch as Record<string, unknown>)[k] !== undefined);
  const { notify, ...rest } = patch;
  const row = await db.userCron.update({
    where: { id: current.id },
    data: {
      ...rest,
      ...(notify !== undefined ? { notify: (notify ?? null) as Prisma.InputJsonValue | null } : {}),
      ...(reschedule ? { nextRunAt: enabled ? (at ?? nextRunFor(cron, timezone)) : null } : {}),
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
  // Sus secretos acotados se van con él.
  await db.secret.deleteMany({ where: { userId: current.ownerId, name: { endsWith: cronSecretName(current.id, "") } } }).catch(() => undefined);
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

type Outcome = { ok: boolean; status: number | null; summary: string | null; error: string | null; exitCode?: number | null; logs?: string | null };

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

/** Cola de un texto (lo último es lo que explica una falla). */
const tail = (s: string, max: number) => (s.length > max ? "…" + s.slice(s.length - max + 1) : s);

/** stdout y stderr en un solo texto, con tope. Puro, con test. */
export function joinLogs(stdout: string, stderr: string, max = LOGS_MAX): string {
  const out = stdout.trimEnd();
  const err = stderr.trimEnd();
  if (!err) return tail(out, max);
  if (!out) return tail(`[stderr]\n${err}`, max);
  const half = Math.floor(max / 2);
  return `${tail(out, half)}\n[stderr]\n${tail(err, max - half - 10)}`;
}

/** El valor de un secreto para la corrida: el del cron primero, luego el de la bóveda. */
export async function cronSecretValue(ownerId: string, cronId: string, name: string): Promise<string | null> {
  return (await getSecretValue(ownerId, cronSecretName(cronId, name)).catch(() => null)) ?? getSecretValue(ownerId, name);
}

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * Caja efímera: monta archivos y secretos-archivo, corre el comando con los secretos-variable en su
 * entorno y la destruye pase lo que pase. La caja vive a lo más timeout + 2 min aunque esto muera.
 */
async function runExec(ownerId: string, a: ExecAction, cronId: string): Promise<Outcome> {
  const env: Record<string, string> = { EASYBITS_CRON_ID: cronId };
  const secretFiles: { path: string; value: string }[] = [];
  for (const sec of a.secrets ?? []) {
    const value = await cronSecretValue(ownerId, cronId, sec.name);
    if (value == null) throw new Error(`El secreto ${sec.name} ya no existe (ni del cron ni en la bóveda)`);
    if (sec.file) {
      const path = boxPath(sec.file);
      secretFiles.push({ path, value });
      env[`${sec.name}_FILE`] = path;
    } else env[sec.name] = value;
  }
  const timeout = a.timeoutSeconds ?? EXEC_DEFAULT_TIMEOUT_S;
  const ops = await import("./sandboxOperations");
  const ctx = await humanCtx(ownerId);
  const box = await ops.createSandbox(ctx, {
    // `python` lo traduce createSandbox a code-interpreter (la plantilla python no está horneada).
    template: a.template ?? "python",
    timeoutSeconds: timeout + 120,
    name: `cron-${cronId}`,
    metadata: { eb_cron: cronId },
  });
  try {
    await ops.waitUntilRunning(ctx, box.sandboxId, { timeoutMs: 90_000 });
    const files = [...(a.files ?? []).map((f) => ({ path: boxPath(f.path), content: f.content, encoding: f.encoding ?? "utf8" })), ...secretFiles.map((f) => ({ path: f.path, content: f.value, encoding: "utf8" as const }))];
    const dirs = [...new Set([EXEC_WORKDIR, ...files.map((f) => f.path.replace(/\/[^/]*$/, "") || "/")])];
    await ops.execCommand(ctx, box.sandboxId, { command: `mkdir -p ${dirs.map(shq).join(" ")}`, timeoutSeconds: 30 });
    for (const f of files) await ops.writeFile(ctx, box.sandboxId, f);
    if (secretFiles.length) {
      await ops.execCommand(ctx, box.sandboxId, { command: `chmod 600 ${secretFiles.map((f) => shq(f.path)).join(" ")}`, timeoutSeconds: 30 });
    }
    const r = await ops.execCommand(ctx, box.sandboxId, { command: a.command, cwd: EXEC_WORKDIR, timeoutSeconds: timeout, env });
    const ok = r.exitCode === 0;
    const lastLine = (r.stdout.trim().split("\n").pop() || r.stderr.trim().split("\n").pop() || "").trim();
    return {
      ok,
      status: null,
      exitCode: r.exitCode,
      logs: joinLogs(r.stdout ?? "", r.stderr ?? ""),
      summary: clip(`exit ${r.exitCode}${lastLine ? ` · ${lastLine}` : ""}`, SUMMARY_MAX),
      error: ok ? null : clip(`exit ${r.exitCode}: ${tail((r.stderr || r.stdout || "").trim(), ERROR_MAX - 20)}`, ERROR_MAX),
    };
  } finally {
    await ops.destroySandbox(ctx, box.sandboxId).catch((e) => console.error(`[user-cron] no se pudo destruir la caja de ${cronId}:`, e));
  }
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
    out =
      action.type === "http"
        ? await runHttp(c.ownerId, action, c.id)
        : action.type === "exec"
          ? await runExec(c.ownerId, action, c.id)
          : await runAgentTurn(c.ownerId, action, c.id);
  } catch (e) {
    const msg = e instanceof Error ? `${e.name === "TimeoutError" ? "Timeout: " : ""}${e.message}` : String(e);
    out = { ok: false, status: null, summary: null, error: clip(msg, ERROR_MAX) };
  }
  const finishedAt = new Date();
  if (run) {
    await db.cronRun
      .update({
        where: { id: run.id },
        data: {
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          ok: out.ok,
          status: out.status,
          summary: out.summary,
          error: out.error,
          ...(out.exitCode != null ? { exitCode: out.exitCode } : {}),
          ...(out.logs ? { logs: out.logs } : {}),
        },
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
  // Avisos y webhooks: disparar y olvidar. Un aviso caído nunca vuelve fallida una corrida buena.
  void notifyRun(c, { ...out, runId: run?.id ?? null, startedAt, durationMs: finishedAt.getTime() - startedAt.getTime() }).catch((e) =>
    console.error(`[user-cron] avisos de ${c.id}:`, e)
  );
  return out;
}

type RunResult = Outcome & { runId: string | null; startedAt: Date; durationMs: number };

/** ¿Toca avisar? Puro, con test. */
export const shouldNotify = (n: CronNotify | null | undefined, ok: boolean) => !!n && (n.on === "always" || !ok);

/** Una línea para el aviso: «✅ «Revisión 1.0.10» terminó · exit 0 · 1.0.9 READY_FOR_SALE». Pura, con test. */
export function notifyText(name: string, r: Pick<Outcome, "ok" | "exitCode" | "summary" | "error">): { title: string; body: string } {
  const title = `${r.ok ? "✅" : "❌"} «${name}» ${r.ok ? "terminó bien" : "falló"}`;
  const detail = (r.ok ? r.summary : r.error ?? r.summary) ?? "";
  return { title, body: clip(detail || (r.exitCode != null ? `exit ${r.exitCode}` : ""), 240) };
}

async function notifyRun(c: UserCron, r: RunResult) {
  const payload = {
    cronId: c.id,
    name: c.name,
    runId: r.runId,
    ok: r.ok,
    exitCode: r.exitCode ?? null,
    status: r.status,
    summary: r.summary,
    error: r.error,
    startedAt: r.startedAt.toISOString(),
    durationMs: r.durationMs,
  };
  void dispatchWebhooks(c.ownerId, r.ok ? "cron.run.succeeded" : "cron.run.failed", payload);
  const n = c.notify as CronNotify | null;
  if (!shouldNotify(n, r.ok)) return;
  const { title, body } = notifyText(c.name, r);
  const url = `${(process.env.BASE_URL || "https://www.easybits.cloud").replace(/\/$/, "")}/dash/admin/crons`;
  const jobs: Promise<unknown>[] = [];
  if (n!.push) {
    jobs.push(
      (async () => {
        const token = await getSecretValue(c.ownerId, n!.push!.secret);
        if (!token) throw new Error(`falta el secreto ${n!.push!.secret}`);
        const res = await fetch(GHOSTY_PUSH_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ title, body, url, tag: `cron:${c.id}` }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`push HTTP ${res.status}`);
      })()
    );
  }
  if (n!.inbox) {
    jobs.push(
      (async () => {
        const box = await ownedInbox(c.ownerId, n!.inbox!);
        if (!box) throw new Error("el buzón ya no existe");
        await appendInboxEvent(box, {
          source: "cron",
          method: null,
          contentType: "application/json",
          headers: { "x-easybits-event": r.ok ? "cron.run.succeeded" : "cron.run.failed" },
          body: JSON.stringify({ event: r.ok ? "cron.run.succeeded" : "cron.run.failed", title, ...payload }),
        });
      })()
    );
  }
  if (n!.email) {
    jobs.push(
      (async () => {
        const owner = await db.user.findUnique({ where: { id: c.ownerId }, select: { email: true } });
        if (!owner?.email) return;
        const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        await sendTransactional({
          to: owner.email,
          subject: title,
          html: `<p>${esc(body)}</p>${r.exitCode != null ? `<p>Código de salida: ${r.exitCode}</p>` : ""}<p><a href="${url}">Ver el cron</a> · <code>easybits crons runs ${c.id} --logs</code></p>`,
        });
      })()
    );
  }
  const results = await Promise.allSettled(jobs);
  for (const x of results) if (x.status === "rejected") console.warn(`[user-cron] aviso de ${c.id} no salió:`, x.reason);
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
    const { run, data } = claimData(c, now);
    const claim = await db.userCron.updateMany({ where: { id: c.id, enabled: true, nextRunAt: c.nextRunAt }, data });
    if (claim.count !== 1 || !run) continue;
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
