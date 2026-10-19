// Copiloto del panel de crons (/dash/admin/crons): un FleetAgent «Asistente de admin» por
// superusuario, creado al primer mensaje (como el builder de Sitios). Corre con el motor de la
// casa (claude-worker + Haiku 5.5 con el Max de la plataforma) y SÓLO el grupo `admin-crons`: lee estado e
// historial y PROPONE correr/pausar, y crear/cambiar/borrar los crons propios del usuario;
// el humano aprueba en la tarjeta con su sesión.
import type { AuthContext } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { getUserOrNull, isAdminUser } from "~/.server/getters";
import { createApiKey } from "~/.server/iam";
import { createFleetAgent, recycleFleetAgentBoxes } from "./fleetAgentOperations";
import { createSecret, getSecretValue } from "./secretOperations";
import { DEFAULT_SITE_ENGINE, getEngine } from "~/lib/fleetEngines";
import { getCronJob } from "~/lib/cronJobs";
import { pendingActionsSince, type PendingActionView } from "./agentActions";
import { COPILOT_KEY_NAME } from "./userCronOperations";
import type { TurnEvent } from "./siteTurns.server";

export const ADMIN_COPILOT_NAME = "Asistente de admin";
const TOOL_GROUP = "admin-crons";
/** Llave propia del copiloto en el vault: READ/WRITE (WRITE la pide el proxy medido), nunca ADMIN. */
export const ADMIN_COPILOT_KEY_SECRET = "EASYBITS_ADMIN_COPILOT_KEY";

export const ADMIN_COPILOT_SYSTEM = [
  "Eres el asistente del panel de tareas programadas (crons) de la plataforma EasyBits. Hablas con un superusuario, en español de México, sin voseo.",
  "Respondes SÓLO con lo que devuelven tus herramientas (list_crons, get_cron_runs). Nunca calcules, estimes ni inventes números, fechas o duraciones: cítalos tal como vienen.",
  "Si te preguntan por qué falló una tarea, llama get_cron_runs y explica el `error` de la ejecución fallida en palabras simples; si no hay error registrado, dilo.",
  "Para ejecutar o pausar/reanudar una tarea SIEMPRE llama run_cron o pause_cron. Esas herramientas no ejecutan: crean una tarjeta de aprobación. Dile al usuario que la apruebe en la tarjeta; no digas que ya se ejecutó y no reintentes.",
  "Además del calendario de la plataforma, el usuario tiene SUS PROPIOS crons («Mis crons»): list_my_crons, create_cron, update_cron, delete_cron y run_my_cron. Sí puedes crearlos: cuando te pidan algo programado («todos los días a las 8:30…», «cada lunes…»), arma el cron de 5 campos en la zona del usuario (default America/Mexico_City; p. ej. diario 8:30 = `30 8 * * *`) y llama create_cron. La acción es `http` (pegarle a una URL https pública, con un secreto del vault como header si hace falta) o `agent_turn` (mandarle un mensaje a uno de sus agentes de la flota). Igual que run_cron, crear/cambiar/borrar/ejecutar sólo PROPONE: sale una tarjeta para aprobar.",
  "Si para lo que piden no existe la vía (p. ej. una URL o un agente que no tienes), dilo claro y pregunta qué URL o agente usar; no inventes ids ni URLs.",
  "Sé breve: lo que encontraste y, si aplica, qué sigue. Sin relleno.",
].join("\n");

export const adminCopilotGroupId = (userId: string) => `admin-crons:${userId}`;

// ── Bittor de «Mis crons» (cualquier cuenta) ─────────────────────────────────────
// Misma maquinaria que el de admin, otra persona y SÓLO las tools de los crons propios.
// El nombre del FleetAgent NO es «Bittor» a secas: ése es el chat público de la casa
// (bittor.ts) y vive en la cuenta de fixtergeek; un findFirst por nombre los cruzaría.

export const CRONS_COPILOT_NAME = "Bittor (crons)";
const CRONS_ASSISTANT_NAME = "Bittor";
const CRONS_TOOL_GROUP = "my-crons";
export const CRONS_COPILOT_KEY_SECRET = "EASYBITS_CRONS_COPILOT_KEY";
/** Turnos al modelo por cuenta en 24 h (lo absorbe la plataforma). Aprobar tarjetas no cuenta. */
export const CRONS_COPILOT_DAILY_TURNS = Number(process.env.CRONS_COPILOT_DAILY_TURNS) || 30;

export const CRONS_COPILOT_SYSTEM = [
  "Eres Bittor, el asistente de «Mis crons» en EasyBits: tareas programadas de la cuenta del usuario. Hablas en español de México, sin voseo, breve y concreto.",
  "Respondes SÓLO con lo que devuelven tus herramientas. Nunca calcules, estimes ni inventes números, fechas, ids o duraciones: cítalos tal como vienen.",
  "Herramientas: list_my_crons (estado, próxima y última ejecución; con logs:true trae el historial), wait_cron_run (espera a que termine la siguiente ejecución y trae sus logs), secret_list (nombres de los secretos de su bóveda; los valores nunca salen), y create_cron, update_cron, delete_cron, run_my_cron.",
  "create_cron, update_cron, delete_cron y run_my_cron NO ejecutan: crean una tarjeta de aprobación. Dile al usuario que la apruebe en la tarjeta; no digas que ya quedó y no reintentes.",
  "Al crear: arma el cron de 5 campos en la zona del usuario (default America/Mexico_City; diario 8:30 = `30 8 * * *`; mínimo cada 5 minutos), o usa `at`/`in` para una sola vez. Acciones: `http` (URL https pública; un secreto de la bóveda puede ir como header con secretName/secretHeader), `agent_turn` (mensaje a uno de sus agentes) o `exec` (comando en una caja desechable: template python|node|bun|ubuntu, timeoutSeconds ≤600, archivos en `files` con su contenido, y secretos de la bóveda POR NOMBRE en `secrets`; éxito = exit 0).",
  "Nunca pidas ni escribas valores de secretos en el chat ni en el comando. Usa sólo nombres que devuelva secret_list. Los secretos de una máquina (los que ves en sus apps) no los puede leer un cron: si el usuario necesita uno, pídele que lo guarde en Secretos (/dash/developer/secrets) con un nombre propio y úsalo por ese nombre.",
  "Sus bases de datos de EasyBits (las de sus apps) las LEES tú directo: db_list para verlas y db_query con una sentencia SELECT (primero `SELECT name, sql FROM sqlite_master WHERE type IN ('table','view')` para conocer el esquema). Sólo lectura: nada de INSERT/UPDATE/DELETE. Para preguntas sobre sus datos («cuántos usuarios tiene…») no hace falta un cron ni un secreto.",
  "Si te preguntan por qué falló, lee el historial (list_my_crons con logs) y explica el error y el exit code en palabras simples, con la línea del log que lo muestra.",
  "Si no existe la vía para lo que piden (una URL o agente que no tienes), dilo y pregunta; no inventes ids ni URLs.",
].join("\n");

export const cronsCopilotGroupId = (userId: string) => `my-crons:${userId}`;

type CopilotSpec = {
  name: string;
  assistantName: string;
  toolGroup: string;
  system: string;
  keySecret: string;
  /** Caja que no se desaloja (sólo el de admin: pocos y de uso diario). */
  pinned: boolean;
};

const ADMIN_SPEC: CopilotSpec = {
  name: ADMIN_COPILOT_NAME,
  assistantName: ADMIN_COPILOT_NAME,
  toolGroup: TOOL_GROUP,
  system: ADMIN_COPILOT_SYSTEM,
  keySecret: ADMIN_COPILOT_KEY_SECRET,
  pinned: true,
};
const CRONS_SPEC: CopilotSpec = {
  name: CRONS_COPILOT_NAME,
  assistantName: CRONS_ASSISTANT_NAME,
  toolGroup: CRONS_TOOL_GROUP,
  system: CRONS_COPILOT_SYSTEM,
  keySecret: CRONS_COPILOT_KEY_SECRET,
  pinned: false,
};

/** Llave del copiloto: se mintea una vez (READ/WRITE) y vive en el vault del dueño. */
async function ensureCopilotKey(ctx: AuthContext, secret: string) {
  if (await getSecretValue(ctx.user.id, secret).catch(() => null)) return;
  // El nombre de la llave es el que hace que las tools sólo PROPONGAN (userCrons.ts).
  const minted = await createApiKey(ctx.user.id, { name: COPILOT_KEY_NAME, scopes: ["READ", "WRITE"] });
  await createSecret(ctx.user.id, { name: secret, value: minted.raw });
}

/** El copiloto del superusuario; se crea al primer mensaje (lazy). */
export const ensureAdminCopilot = (ctx: AuthContext) => ensureCopilot(ctx, ADMIN_SPEC);
/** Bittor de «Mis crons»; se crea al primer mensaje (lazy). */
export const ensureCronsCopilot = (ctx: AuthContext) => ensureCopilot(ctx, CRONS_SPEC);

async function ensureCopilot(ctx: AuthContext, spec: CopilotSpec): Promise<{ id: string }> {
  await ensureCopilotKey(ctx, spec.keySecret);
  const existing = await db.fleetAgent.findFirst({
    where: { ownerId: ctx.user.id, name: spec.name },
    select: { id: true, persona: true, workerTemplate: true, platformClaude: true },
  });
  const engine = getEngine(DEFAULT_SITE_ENGINE)!;
  const env: Record<string, string> = {
    ...(engine.env ?? {}),
    EASYBITS_TOOL_GROUP: spec.toolGroup,
    ...(engine.modelEnv && engine.defaultModel ? { [engine.modelEnv]: engine.defaultModel } : {}),
    SYSTEM_PROMPT: spec.system,
    ASSISTANT_NAME: spec.assistantName,
    // Su caja no se desaloja (como Bittor): despertar en caliente es ~1 s; en frío, ~15-40 s.
    ...(spec.pinned ? { FLEET_PINNED: "1" } : {}),
  };
  if (existing) {
    // Motor, prompt o toolset cambiados en código: se reescriben y se recicla la caja.
    const persona = (existing.persona as { env?: Record<string, string>; easybitsKeySecret?: string } | null) ?? {};
    const stale =
      existing.workerTemplate !== engine.template ||
      !!existing.platformClaude !== !!engine.platformClaude ||
      persona.easybitsKeySecret !== spec.keySecret ||
      Object.entries(env).some(([k, v]) => persona.env?.[k] !== v);
    if (stale) {
      // Lo del motor anterior (ghosty-gc) fuera: su MCP se armaba con EASYBITS_TOOLS.
      const { GHOSTY_LLM: _l, EASYBITS_TOOLS: _t, DEEPSEEK_MODEL: _d, ...rest } = persona.env ?? {};
      await db.fleetAgent.update({
        where: { id: existing.id },
        data: {
          workerTemplate: engine.template,
          platformClaude: !!engine.platformClaude,
          persona: { ...persona, easybitsKeySecret: spec.keySecret, env: { ...rest, ...env } },
        },
      });
      await recycleFleetAgentBoxes({ id: existing.id, ownerId: ctx.user.id }).catch(() => {});
    }
    return { id: existing.id };
  }
  const created = await createFleetAgent(ctx, {
    name: spec.name,
    workerTemplate: engine.template,
    persona: { name: spec.assistantName, env, easybitsKeySecret: spec.keySecret },
    idleSuspendMin: 2,
  });
  await db.fleetAgent.update({
    where: { id: created.id },
    data: { assistantName: spec.assistantName, ...(engine.platformClaude ? { platformClaude: true } : {}) },
  });
  return { id: created.id };
}

export type CopilotContext = { page?: string; job?: string; cron?: string };

/** Lee `context` del body sin confiar en él: sólo campos conocidos y cortos. */
export function parseCopilotContext(raw: unknown): CopilotContext | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const page = typeof r.page === "string" ? r.page.slice(0, 40) : undefined;
  const job = typeof r.job === "string" && getCronJob(r.job) ? r.job : undefined;
  // Un cron propio abierto en «Mis crons»: sólo un id; el agente lo resuelve con sus tools.
  const cron = typeof r.cron === "string" && /^[a-f0-9]{24}$/.test(r.cron) ? r.cron : undefined;
  return page || job || cron ? { page, job, cron } : null;
}

/** Lo que el usuario ve, como prefijo del texto del turno (en sesión caliente el append de sistema no siempre llega). */
export function copilotTurnText(text: string, context: CopilotContext | null, crons?: string): string {
  // El estado de los crons va en el turno: ahorra el `list_crons` del arranque (un viaje de
  // ida y vuelta al modelo por pregunta).
  const brief = crons ? `[Estado de los crons ahora — no los vuelvas a listar para esto]\n${crons}\n` : "";
  if (!context) return brief + text;
  const parts: string[] = [];
  if (context.page) parts.push(`pantalla: ${context.page}`);
  if (context.job) {
    const job = getCronJob(context.job)!;
    parts.push(`tarea seleccionada: ${job.key} («${job.name}»)`);
  }
  if (context.cron) parts.push(`cron abierto: ${context.cron}`);
  return `[Contexto del panel — ${parts.join("; ")}]\n${brief}${text}`;
}

const STATUS_WORDS: Record<string, string> = { "al-dia": "al día", tarde: "tarde", fallo: "falló", pausado: "pausado", nuevo: "sin ejecuciones" };

/** Una línea por cron, con lo que ve el panel (estado, horario, última ejecución). */
export async function cronsBrief(): Promise<string> {
  const { listCronOverview } = await import("~/.server/cron");
  const jobs = await listCronOverview();
  return jobs
    .map((j) => {
      const last = j.lastRun ? `última ${j.lastRun.startedAt} (${j.lastRun.ok === false ? "falló" : j.lastRun.running ? "en ejecución" : "ok"})` : "sin ejecuciones";
      return `- ${j.key} «${j.name}»: ${STATUS_WORDS[j.status] ?? j.status}; ${j.schedule}; ${last}`;
    })
    .join("\n");
}

/** Los crons del usuario, una línea cada uno (ahorra el `list_my_crons` del arranque). */
export async function myCronsBrief(ownerId: string): Promise<string> {
  const rows = await db.userCron.findMany({
    where: { ownerId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, enabled: true, cron: true, at: true, timezone: true, lastRunAt: true, lastOk: true, nextRunAt: true },
    take: 50,
  });
  if (!rows.length) return "- (no tiene crons todavía)";
  return rows
    .map((c) => {
      const when = c.at ? `una vez ${c.at.toISOString()}` : `${c.cron} (${c.timezone})`;
      const last = c.lastRunAt ? `última ${c.lastRunAt.toISOString()} (${c.lastOk === false ? "falló" : "ok"})` : "sin ejecuciones";
      return `- ${c.id} «${c.name}»: ${c.enabled ? "activo" : "pausado/terminado"}; ${when}; ${last}`;
    })
    .join("\n");
}

/** El texto del usuario como lo escribió (sin el contexto que le antepone `copilotTurnText`). */
export const stripCopilotContext = (text: string) =>
  text
    .replace(/^\[Contexto del panel — [^\]]*\]\n/, "")
    .replace(/^\[Estado de los crons ahora[^\]]*\]\n(?:- .*\n)*/, "");

/** Evento `permission` (forma de ACP/Ghosty) para la tarjeta de aprobación. */
export function permissionEvent(a: PendingActionView): TurnEvent {
  return {
    type: "permission",
    id: a.id,
    title: a.summary,
    tool: a.tool,
    expiresAt: a.expiresAt,
    options: [
      { optionId: "approve", name: "Aprobar", kind: "allow_once" },
      { optionId: "reject", name: "Rechazar", kind: "reject_once" },
    ],
  };
}

/** `afterTool` del turno: las propuestas nacidas en él salen como `permission`. */
export function copilotAfterTool(ownerId: string) {
  return async (startedAt: Date) => (await pendingActionsSince(ownerId, startedAt)).map(permissionEvent);
}

/**
 * SESIÓN de superusuario y nada más. Cualquier `Authorization` (llave de API, token de
 * turno, token de flota) se rechaza aunque venga con cookie: si la llave del agente
 * alcanzara la aprobación, el agente se aprobaría a sí mismo. En POST, además, el
 * `Origin` (si viene) debe ser el propio: una cookie no basta contra un form de otro sitio.
 */
export const requireAdminSession = (request: Request) => requireSession(request, true);

/** Lo mismo para cualquier cuenta (Bittor de «Mis crons»): sesión del panel, nunca llaves. */
export async function requireSession(request: Request, admin: boolean) {
  if (request.headers.get("Authorization")) {
    throw Response.json({ error: "session_required", message: "Sólo con la sesión del panel, no con llaves." }, { status: 403 });
  }
  if (request.method !== "GET") {
    const origin = request.headers.get("Origin");
    if (origin && origin !== new URL(request.url).origin && !sameHost(origin, request)) {
      throw Response.json({ error: "bad_origin" }, { status: 403 });
    }
  }
  const user = await getUserOrNull(request).catch(() => null);
  if (!user) throw Response.json({ error: "Unauthorized" }, { status: 401 });
  if (admin && !isAdminUser(user)) throw Response.json({ error: "Forbidden", reason: "platform_admin_only" }, { status: 403 });
  return { user, scopes: ["READ", "WRITE"] } as AuthContext;
}

// Detrás de Caddy `request.url` puede traer http://localhost:3001; se compara contra Host.
function sameHost(origin: string, request: Request) {
  const host = request.headers.get("X-Forwarded-Host") ?? request.headers.get("Host");
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}
