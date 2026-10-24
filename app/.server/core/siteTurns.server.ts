// Turnos del chat de /dash/sitios que viven APARTE de la petición HTTP.
//
// Antes el turno corría dentro del POST SSE: recargar la página no lo re-enganchaba y un
// deploy a media obra perdía la respuesta, la narración y la telemetría (15-oct, 60
// acciones). Ahora el POST arranca el turno y sólo se SUSCRIBE; el turno sigue aunque el
// navegador se vaya, cualquier pestaña se re-engancha (snapshot + en vivo) y si el
// proceso muere, el barrido lo cierra como «interrumpido» con lo que alcanzó a escribir.
// Patrón de ghosty-studio (app/lib/agents/turns.server.ts).
import { db } from "~/.server/db";
import type { AuthContext } from "~/.server/apiAuth";
import { withAdmitRetry } from "./fleetAdmitHold";
import { routeMessage, FleetAgentAtCapacity } from "./fleetAgentOperations";
import { ensureSiteMachine, getSite, siteGroupId, siteTurnPrompt } from "./siteOperations";
import { recordFleetTurnUsage } from "./fleetUsage";
import { getEngineForAgent } from "~/lib/fleetEngines";
import { narracionAMarkdown, partirNarracion } from "~/lib/narracion";
import { isDraining, registerDrain } from "~/.server/lifecycle.server";
import { MAX_STEPS, lastIntent, normalizeStepResult, publicStep, stepKind, stepsSignature, upsertStep, type AgentStep, type BrowserFrame, type StepNote } from "~/lib/agentSteps";

type Site = Awaited<ReturnType<typeof getSite>>;
export type TurnEvent = { type: string; [k: string]: unknown };
type Selection = { id: string; tag: string } | null;

/** Quién es este proceso: un turno sólo está «en memoria» en el que lo arrancó. */
const INSTANCE = `${process.pid}:${Date.now().toString(36)}`;
const HEARTBEAT_MS = 5_000;
/** Sin latido por más de esto (y no vive aquí) = su proceso murió. */
const STALE_MS = 30_000;
/** Un turno de sitio nunca dura tanto: ghosty-gc corta a los 15 min. */
const MAX_TURN_MS = 30 * 60_000;
const TERMINAL = new Set(["done", "error", "capacity", "interrupted", "cancelled"]);

type Live = {
  turnId: string;
  groupId: string;
  fleetAgentId: string;
  text: string;
  tools: string[];
  cortes: number[];
  /** Intención vigente: la última narración antes de una herramienta (la heredan las siguientes). */
  intent?: string;
  /** «La computadora del agente»: un paso por herramienta (ver ~/lib/agentSteps). */
  steps: AgentStep[];
  finished: boolean;
  listeners: Set<(e: TurnEvent) => void>;
  /** «Detener» explícito: corta la lectura del worker (routeMessage `signal`). */
  abort: AbortController;
};
// globalThis: el dev server recarga módulos y perdería los turnos en curso.
const g = globalThis as unknown as { __ebSiteTurns?: Map<string, Live> };
const live = (g.__ebSiteTurns ??= new Map<string, Live>()); // por groupId

/** Esta instancia se está apagando (deploy): el navegador reintenta y cae en la nueva. */
export class AppDraining extends Error {
  constructor() {
    super("La plataforma se está actualizando; reintenta en unos segundos");
  }
}

export class TurnBusy extends Error {
  constructor(readonly activeTurnId: string) {
    super("Ya hay un turno en curso en esta conversación");
  }
}

/** Aplica un cambio a un paso y lo emite completo (`step`): el cliente reemplaza por `id`. */
function pushStep(l: Live, patch: Partial<AgentStep> & { id: string }) {
  l.steps = upsertStep(l.steps, patch);
  const step = l.steps.find((s) => s.id === patch.id);
  if (step) emit(l, { type: "step", step });
}

/** ¿Esta sesión del navegador es del turno en curso de la conversación? («Tomar el control»). */
export function liveBrowserSession(groupId: string, sessionId: string): { fleetAgentId: string } | null {
  const l = live.get(groupId);
  if (!l || l.finished) return null;
  return l.steps.some((s) => s.browser?.sessionId === sessionId) ? { fleetAgentId: l.fleetAgentId } : null;
}

/** ¿Hay un panel mirando esta conversación? Si no (WhatsApp, otros canales), no se sube nada. */
export function hasLiveTurn(fleetAgentId: string, groupId: string) {
  const l = live.get(groupId);
  return !!l && !l.finished && l.fleetAgentId === fleetAgentId;
}

/**
 * Captura del navegador del agente (MCP render, tools browser_*) para el turno en vivo de esa
 * conversación. Se cuelga del paso de navegador que está corriendo; si el worker aún no
 * anunció la tool, crea uno propio. No-op si el turno no vive en este proceso.
 */
/**
 * Una herramienta del turno espera la aprobación de la persona (reglas `ask`, fleetApprovals):
 * la tarjeta sale en el chat del turno en curso. Si el turno ya no vive aquí, la persona la ve
 * en el webhook o en la lista de aprobaciones.
 */
export function emitApproval(fleetAgentId: string, groupId: string, approval: { id: string; tool: string; summary: string; expiresAt: string }) {
  const l = live.get(groupId);
  if (!l || l.finished || l.fleetAgentId !== fleetAgentId) return;
  emit(l, { type: "approval", approval });
}

/** Aviso honesto del paso de navegador en curso (antibot, captcha): el panel lo pinta en vivo. */
export function noteBrowserStep(fleetAgentId: string, groupId: string, note: Omit<StepNote, "at">) {
  const l = live.get(groupId);
  if (!l || l.finished || l.fleetAgentId !== fleetAgentId) return;
  const running = [...l.steps].reverse().find((s) => s.kind === "browser" && s.status === "running");
  if (running) pushStep(l, { id: running.id, note: { ...note, at: Date.now() } });
}

export function pushBrowserFrame(fleetAgentId: string, groupId: string, frame: BrowserFrame, tool: string) {
  const l = live.get(groupId);
  // Sólo el agente de esa conversación: el groupId viaja en un header del worker.
  if (!l || l.finished || l.fleetAgentId !== fleetAgentId) return;
  const running = [...l.steps].reverse().find((s) => s.kind === "browser" && s.status === "running");
  pushStep(l, running ? { id: running.id, browser: frame } : { id: `browser-${Date.now()}`, tool, kind: "browser", status: "ok", startedAt: Date.now(), endedAt: Date.now(), browser: frame });
}

function emit(l: Live, e: TurnEvent) {
  for (const fn of l.listeners) {
    try { fn(e); } catch { /* listener caído */ }
  }
}

const userLine = (text: string, selection: Selection) => (selection ? `[${selection.id}] ${text}` : text);

/** Lo que recibe el agente para retomar un turno cortado. */
export function continuePrompt(userText: string) {
  return [
    "[Tu turno anterior se cortó por una falla de la plataforma, no por algo que hicieras mal. Revisa lo que ya hiciste (archivos del sitio y tu historial) y CONTINÚA desde donde te quedaste hasta terminar. No empieces de cero.]",
    "",
    "La petición original era:",
    userText,
  ].join("\n");
}

/** Lo que el turno le manda al agente, armado justo antes de rutearlo. */
type TurnMessage = { text: string; image?: { base64: string; ext: string }; appendSystemPrompt?: string };

/**
 * Un turno durable de cualquier superficie del dashboard que hable con un FleetAgent por
 * `groupId` (Sitios, copiloto del panel de crons). Lo propio de cada superficie va en
 * `prepare` (qué se le dice al agente) y `afterTool` (eventos extra, p. ej. `permission`).
 */
export type AgentTurnSpec = {
  surface: string;
  groupId: string;
  fleetAgentId: string;
  siteId?: string | null;
  sender: string;
  /** Lo que escribió el usuario: es lo que recibe el agente (vía `prepare`). */
  text: string;
  /** Lo que se guarda como `userText` del turno (default: `text`). */
  storedText?: string;
  turnId?: string;
  continueTurnId?: string;
  prepare: (agentText: string) => Promise<TurnMessage>;
  /** Tras cada herramienta que termina y al cerrar: eventos extra a emitir (sin repetir por `id`). */
  afterTool?: (startedAt: Date) => Promise<TurnEvent[]>;
};

/**
 * Arranca un turno y regresa su id SIN esperar a que termine. Idempotente por `turnId`
 * (un reintento del navegador no duplica el turno); `TurnBusy` si ya corre otro en el grupo.
 */
export async function startAgentTurn(ctx: AuthContext, spec: AgentTurnSpec): Promise<{ turnId: string }> {
  if (isDraining()) throw new AppDraining();
  const { groupId } = spec;
  if (spec.turnId) {
    const same = await db.fleetTurn.findUnique({ where: { turnId: spec.turnId }, select: { turnId: true, groupId: true } });
    if (same?.groupId === groupId) return { turnId: same.turnId };
  }
  const running = live.get(groupId);
  if (running && !running.finished) throw new TurnBusy(running.turnId);
  // Un `running` que no vive aquí es de un proceso muerto: se cierra antes de seguir.
  await sweepGroup(groupId);
  const stillRunning = await db.fleetTurn.findFirst({ where: { groupId, state: "running" }, select: { turnId: true } });
  if (stillRunning) throw new TurnBusy(stillRunning.turnId);

  let userText = spec.storedText ?? spec.text;
  let agentText = spec.text;
  let continuesTurnId: string | undefined;
  if (spec.continueTurnId) {
    const prev = await db.fleetTurn.findUnique({ where: { turnId: spec.continueTurnId } });
    if (!prev || prev.groupId !== groupId) throw new Response("Turno no encontrado", { status: 404 });
    userText = prev.userText;
    agentText = continuePrompt(prev.userText);
    continuesTurnId = prev.turnId;
  }
  const turnId = spec.turnId && /^[a-zA-Z0-9-]{8,64}$/.test(spec.turnId) ? spec.turnId : crypto.randomUUID();
  const startedAt = new Date();
  await db.fleetTurn.create({
    data: {
      turnId,
      surface: spec.surface,
      ownerId: ctx.user.id,
      fleetAgentId: spec.fleetAgentId,
      groupId,
      siteId: spec.siteId ?? null,
      state: "running",
      userText,
      instance: INSTANCE,
      continuesTurnId: continuesTurnId ?? null,
      startedAt,
    },
  });
  const l: Live = { turnId, groupId, fleetAgentId: spec.fleetAgentId, text: "", tools: [], cortes: [], steps: [], finished: false, listeners: new Set(), abort: new AbortController() };
  live.set(groupId, l);
  void runAgentTurn(spec, l, { agentText, isContinue: !!continuesTurnId, startedAt }).catch((e) =>
    console.error(`[${spec.surface}] turno`, turnId, e)
  );
  return { turnId };
}

/**
 * Turno de Sitios: el agente recibe la selección y la imagen en el texto, y el prompt del
 * sitio (con su caja) como append de sistema.
 */
export async function startSiteTurn(
  ctx: AuthContext,
  site: Site,
  builder: { id: string },
  input: { text: string; selection: Selection; image?: { base64: string; ext: string }; turnId?: string; continueTurnId?: string }
): Promise<{ turnId: string }> {
  const { selection, image } = input;
  return startAgentTurn(ctx, {
    surface: "sites",
    groupId: siteGroupId(site.id),
    fleetAgentId: builder.id,
    siteId: site.id,
    sender: "sitios",
    text: input.text,
    storedText: userLine(input.text, selection),
    turnId: input.turnId,
    continueTurnId: input.continueTurnId,
    prepare: async (agentText) => {
      // Si el sembrado al crear el sitio falló (caja aún arrancando), se repite aquí
      // antes de que el agente encuentre /app vacío. Nunca bloquea el turno.
      const machine = (await ensureSiteMachine(ctx, site).catch((e) => console.error("[sites] ensureSiteMachine", site.sandboxId, e))) ?? {};
      // Revivida desde el archivo: el prompt del turno debe nombrar la caja nueva.
      if (machine.revived) Object.assign(site, await getSite(ctx, site.id));
      return {
        // La selección va EN el texto (no solo en el system append): en una
        // sesión caliente el appendSystemPrompt por turno no siempre llega.
        text: [
          selection
            ? `[Elemento seleccionado en la vista previa: <${selection.tag} data-eb-id="${selection.id}">. Modifica SOLO ese nodo.]`
            : "",
          image ? "[El usuario adjuntó una imagen (mockup/referencia): mírala antes de responder y úsala como guía visual.]" : "",
          agentText,
        ].filter(Boolean).join("\n"),
        image,
        appendSystemPrompt: siteTurnPrompt(site, selection, machine),
      };
    },
  });
}

async function runAgentTurn(spec: AgentTurnSpec, l: Live, input: { agentText: string; isContinue: boolean; startedAt: Date }) {
  const builderId = spec.fleetAgentId;
  let dirty = false;
  const flush = () =>
    db.fleetTurn
      .update({ where: { turnId: l.turnId }, data: { text: l.text, tools: l.tools, cortes: l.cortes, steps: l.steps, heartbeatAt: new Date() } })
      .catch(() => undefined);
  // Latido: aunque el agente pase minutos en una herramienta sin escribir, la fila dice
  // que este proceso sigue vivo (si no, el barrido lo daría por muerto).
  const beat = setInterval(() => {
    dirty = false;
    void flush();
  }, HEARTBEAT_MS);
  // Eventos extra de la superficie (p. ej. `permission`), cada `id` una sola vez.
  const extraSeen = new Set<string>();
  const emitExtras = async () => {
    if (!spec.afterTool) return;
    const evs = await spec.afterTool(input.startedAt).catch((e) => {
      console.error(`[${spec.surface}] afterTool`, l.turnId, e);
      return [] as TurnEvent[];
    });
    for (const e of evs) {
      const key = `${e.type}:${String(e.id ?? "")}`;
      if (extraSeen.has(key)) continue;
      extraSeen.add(key);
      emit(l, e);
    }
  };
  let extras = Promise.resolve();
  let state = "done";
  let error: string | null = null;
  let reply = "";
  try {
    const msg = await spec.prepare(input.agentText);
    if (input.isContinue) {
      await db.fleetAgentMessage
        .create({ data: { fleetAgentId: builderId, groupId: l.groupId, role: "user", text: "Continuar" } })
        .catch(() => undefined);
    }
    reply = await withAdmitRetry(() =>
      routeMessage(
        builderId,
        {
          groupId: l.groupId,
          sender: spec.sender,
          text: msg.text,
          image: msg.image,
          appendSystemPrompt: msg.appendSystemPrompt,
        },
        {
          turnId: l.turnId,
          skipUserLog: input.isContinue,
          signal: l.abort.signal,
          onChunk: (value) => {
            l.text += value;
            dirty = true;
            emit(l, { type: "chunk", value });
          },
          // Dónde arrancó cada herramienta en el texto: con eso la copia guardada separa la
          // narración («Reviso…», «Instalo…») de la respuesta, igual que en vivo.
          onTool: (name, ev) => {
            if (ev?.phase === "start" || !ev) {
              l.intent = lastIntent(l.text.slice(l.cortes[l.cortes.length - 1] ?? 0)) ?? l.intent;
              if (l.text.trim() && l.cortes[l.cortes.length - 1] !== l.text.length) l.cortes.push(l.text.length);
              l.tools.push(name);
            }
            dirty = true;
            emit(l, { type: "tool", name, id: ev?.id, phase: ev?.phase, ok: ev?.ok });
            if (ev?.id) {
              const end = ev.phase === "end";
              const prev = end ? l.steps.find((s) => s.id === ev.id) : undefined;
              const result = ev.result ? normalizeStepResult(ev.result, prev?.kind) : undefined;
              // Una herramienta de navegador que regresó imagen pero no frame (screenshot_url,
              // web_interact…): su primera imagen ES lo que vio. Un solo camino para todas.
              const shot = prev?.kind === "browser" && !prev.browser && result?.images?.[0];
              const step = end
                ? { id: ev.id, status: ev.ok === false ? ("error" as const) : ("ok" as const), endedAt: Date.now(), ...(result ? { result } : {}), ...(ev.todos ? { todos: ev.todos } : {}), ...(shot ? { browser: { url: prev?.detail ?? "", title: shot.title ?? "", image: shot.url } } : {}) }
                : { id: ev.id, tool: name, kind: stepKind(name), detail: ev.detail, command: ev.command, intent: l.intent, status: "running" as const, startedAt: Date.now(), ...(ev.todos ? { todos: ev.todos } : {}) };
              if (end || l.steps.length < MAX_STEPS) pushStep(l, step);
            }
            if (ev?.phase === "end") extras = extras.then(emitExtras);
          },
        }
      )
    );
    await saveNarrated(builderId, l.groupId, reply, l.text, l.cortes).catch((e) => console.error(`[${spec.surface}] narración`, e));
    if (l.abort.signal.aborted) state = "cancelled";
  } catch (e) {
    if (e instanceof FleetAgentAtCapacity) state = "capacity";
    else state = "error";
    error = e instanceof Error ? e.message : "error";
  } finally {
    clearInterval(beat);
    void dirty;
    // Antes del final: una propuesta hecha en la última herramienta también sale.
    await extras;
    await emitExtras();
    l.finished = true;
    await db.fleetTurn
      .update({
        where: { turnId: l.turnId },
        data: { state, error, text: l.text, tools: l.tools, cortes: l.cortes, steps: l.steps, heartbeatAt: new Date(), endedAt: new Date() },
      })
      .catch((e) => console.error(`[${spec.surface}] cierre del turno`, l.turnId, e));
    if (state === "done") emit(l, { type: "done", value: reply });
    else if (state === "cancelled") emit(l, { type: "cancelled", turnId: l.turnId });
    else if (state === "capacity") emit(l, { type: "capacity", message: error, retryAfter: 10 });
    else emit(l, { type: "error", message: error });
    l.listeners.clear();
    // Un rato en memoria por si una pestaña llega tarde; después manda la fila.
    setTimeout(() => {
      if (live.get(l.groupId) === l) live.delete(l.groupId);
    }, 60_000);
  }
}

/** Reescribe la fila recién guardada del turno con la narración como `- ✓ …`. Sólo si la
 *  fila es exactamente lo que llegó por el stream (si no, los cortes no aplican). */
async function saveNarrated(fleetAgentId: string, groupId: string, reply: string, streamed: string, cortes: number[]) {
  if (!cortes.length || reply !== streamed) return;
  const { pasos, resto } = partirNarracion(streamed, cortes);
  if (!pasos.length) return;
  const row = await db.fleetAgentMessage.findFirst({
    where: { fleetAgentId, groupId, role: "agent" },
    orderBy: { createdAt: "desc" },
    select: { id: true, text: true },
  });
  if (row?.text !== reply) return;
  await db.fleetAgentMessage.update({ where: { id: row.id }, data: { text: narracionAMarkdown(pasos, resto) } });
}

/**
 * Suscribe a lo que pase en el turno del sitio. Si el turno vive en este proceso: snapshot
 * y en vivo. Si su fila dice `running` pero vive en otro proceso (o en uno que murió): se
 * sigue la fila hasta que cierre. Si ya terminó hace poco: su evento final. Regresa la
 * función para desuscribirse.
 */
export function subscribeSiteTurn(groupId: string, send: (e: TurnEvent) => void, opts: { snapshot: boolean }): () => void {
  const l = live.get(groupId);
  if (l && !l.finished) {
    if (opts.snapshot) send({ type: "snapshot", turnId: l.turnId, text: l.text, tools: l.tools, cortes: l.cortes, steps: l.steps });
    l.listeners.add(send);
    return () => l.listeners.delete(send);
  }
  let stopped = false;
  let lastText: string | null = null;
  let lastTools = -1;
  let lastSteps = "";
  const poll = async () => {
    if (stopped) return;
    await sweepGroup(groupId).catch(() => undefined);
    const row = await db.fleetTurn.findFirst({ where: { groupId }, orderBy: { startedAt: "desc" } }).catch(() => null);
    if (stopped) return;
    if (!row) return send({ type: "idle" });
    const recent = row.endedAt && Date.now() - row.endedAt.getTime() < 10 * 60_000;
    if (row.state === "running") {
      const steps = (row.steps as AgentStep[] | null) ?? [];
      // Un paso que sólo ganó captura o resultado no cambia el texto ni el número de tools:
      // sin esta firma, quien sigue la fila desde otro proceso no lo veía.
      const sig = stepsSignature(steps);
      if (row.text !== lastText || row.tools.length !== lastTools || sig !== lastSteps) {
        lastText = row.text;
        lastTools = row.tools.length;
        lastSteps = sig;
        send({ type: "snapshot", turnId: row.turnId, text: row.text, tools: row.tools, cortes: row.cortes, steps });
      }
      setTimeout(() => void poll(), 2_000);
      return;
    }
    if (lastText === null && !recent) return send({ type: "idle" });
    send(terminalEvent(row));
  };
  void poll();
  return () => {
    stopped = true;
  };
}

function terminalEvent(row: { turnId: string; state: string; text: string; error: string | null }): TurnEvent {
  if (row.state === "done") return { type: "done", turnId: row.turnId, value: row.text };
  if (row.state === "capacity") return { type: "capacity", turnId: row.turnId, message: row.error, retryAfter: 10 };
  if (row.state === "interrupted") return { type: "interrupted", turnId: row.turnId, canContinue: true };
  if (row.state === "cancelled") return { type: "cancelled", turnId: row.turnId };
  return { type: "error", turnId: row.turnId, message: row.error ?? "error" };
}

/**
 * «Detener» explícito de un turno. Desconectarse NUNCA lo detiene (el turno sobrevive a
 * recargas y deploys); esto sí: corta la lectura del worker, guarda lo dicho y cierra el turno
 * como `cancelled`. Idempotente: un turno que ya terminó contesta su estado.
 *  - `stopped`: se detuvo aquí (o ya estaba detenido/terminado).
 *  - `elsewhere`: corre en otra instancia (deploy con traslape) y no se puede cortar desde aquí.
 */
export async function cancelAgentTurn(groupId: string, turnId: string): Promise<"stopped" | "elsewhere" | "not_found"> {
  const l = live.get(groupId);
  if (l && l.turnId === turnId) {
    if (!l.finished) l.abort.abort();
    return "stopped";
  }
  const row = await db.fleetTurn.findUnique({ where: { turnId }, select: { groupId: true, state: true } }).catch(() => null);
  if (!row || row.groupId !== groupId) return "not_found";
  return row.state === "running" ? "elsewhere" : "stopped";
}

/**
 * Liga pública del replay de un turno (el último si no se dice cuál). Privado por default: sólo
 * existe cuando el dueño la pide, y es la misma cada vez (idempotente).
 */
export async function shareTurnReplay(groupId: string, turnId?: string): Promise<string> {
  const row = await db.fleetTurn.findFirst({
    where: { groupId, ...(turnId ? { turnId } : { state: { not: "running" } }) },
    orderBy: { startedAt: "desc" },
    select: { id: true, shareToken: true },
  });
  if (!row) throw new Response("Turno no encontrado", { status: 404 });
  if (row.shareToken) return row.shareToken;
  const { randomBytes } = await import("node:crypto");
  const shareToken = randomBytes(18).toString("base64url");
  await db.fleetTurn.update({ where: { id: row.id }, data: { shareToken } });
  return shareToken;
}

/** Deja de compartir: la liga pública responde 404 desde ya. */
export async function unshareTurnReplays(groupId: string) {
  await db.fleetTurn.updateMany({ where: { groupId, shareToken: { not: null } }, data: { shareToken: null } });
}

/** El replay compartido: lo que pidió la persona, lo que respondió el agente y sus pasos. */
export async function getSharedReplay(token: string) {
  if (!/^[\w-]{20,40}$/.test(token)) return null;
  const row = await db.fleetTurn.findFirst({
    where: { shareToken: token },
    select: { userText: true, text: true, cortes: true, steps: true, startedAt: true, endedAt: true, state: true },
  });
  const steps = ((row?.steps as AgentStep[] | null) ?? []).map(publicStep);
  return row ? { ...row, steps } : null;
}

/** Estado para el editor al cargar: turno en curso o el último cortado (para «Continuar»). */
export async function siteTurnStatus(groupId: string) {
  await sweepGroup(groupId).catch(() => undefined);
  const row = await db.fleetTurn.findFirst({
    where: { groupId },
    orderBy: { startedAt: "desc" },
    select: { turnId: true, state: true, steps: true },
  });
  if (!row) return { activeTurn: null, lastTurn: null };
  return {
    activeTurn: row.state === "running" ? { turnId: row.turnId } : null,
    // `steps`: al recargar, el panel «la computadora del agente» muestra el replay del último turno.
    lastTurn: { turnId: row.turnId, state: row.state, steps: (row.steps as AgentStep[] | null) ?? [] },
  };
}

/** Cierra los `running` de este sitio cuyo proceso ya no existe. */
async function sweepGroup(groupId: string) {
  const l = live.get(groupId);
  const rows = await db.fleetTurn.findMany({ where: { groupId, state: "running" } });
  for (const row of rows) {
    if (l && l.turnId === row.turnId && !l.finished) continue;
    if (row.instance === INSTANCE) {
      // Era de este proceso y ya no está en memoria: nunca debería pasar; ciérralo.
      await interruptTurn(row, "perdido en memoria");
      continue;
    }
    const age = Date.now() - row.heartbeatAt.getTime();
    if (age > STALE_MS || Date.now() - row.startedAt.getTime() > MAX_TURN_MS) await interruptTurn(row, "proceso muerto");
  }
}

/** Barrido global: turnos cuyo proceso murió (deploy, caída). Lo corre el arranque y un timer. */
export async function sweepSiteTurns() {
  const cutoff = new Date(Date.now() - STALE_MS);
  const rows = await db.fleetTurn.findMany({ where: { state: "running", heartbeatAt: { lt: cutoff } } });
  for (const row of rows) {
    const l = live.get(row.groupId);
    if (l && l.turnId === row.turnId && !l.finished) continue;
    await interruptTurn(row, "proceso muerto");
  }
}

type TurnRow = NonNullable<Awaited<ReturnType<typeof db.fleetTurn.findFirst>>>;

/**
 * Cierra un turno muerto UNA sola vez (updateMany condicionado a `running`): guarda lo que
 * alcanzó a escribir como respuesta, con el aviso, y deja la telemetría del turno.
 */
async function interruptTurn(row: TurnRow, why: string) {
  const { count } = await db.fleetTurn.updateMany({
    where: { turnId: row.turnId, state: "running" },
    data: { state: "interrupted", error: why, endedAt: new Date() },
  });
  if (count !== 1) return;
  const { pasos, resto } = partirNarracion(row.text, row.cortes);
  const parcial = pasos.length ? narracionAMarkdown(pasos, resto) : row.text.trim();
  const aviso = "_Se interrumpió por un reinicio de la plataforma. Usa «Continuar» para que el agente retome donde se quedó._";
  await db.fleetAgentMessage
    .create({ data: { fleetAgentId: row.fleetAgentId, groupId: row.groupId, role: "agent", text: [parcial, aviso].filter(Boolean).join("\n\n") } })
    .catch((e) => console.error("[sites] guardar turno interrumpido", row.turnId, e));
  const agent = await db.fleetAgent
    .findUnique({ where: { id: row.fleetAgentId }, select: { workerTemplate: true, persona: true, billingMode: true } })
    .catch(() => null);
  recordFleetTurnUsage(
    {
      ownerId: row.ownerId,
      fleetAgentId: row.fleetAgentId,
      groupId: row.groupId,
      engine: agent ? getEngineForAgent(agent.workerTemplate, (agent.persona as { env?: Record<string, string> } | null)?.env) : null,
      billingMode: agent?.billingMode ?? null,
    },
    { durationMs: Date.now() - row.startedAt.getTime(), toolCalls: row.tools.length }
  );
  console.warn(`[sites] turno ${row.turnId} interrumpido (${why}); guardados ${row.text.length} caracteres`);
}

// Al arrancar el proceso (p. ej. tras un deploy) se cierran los turnos que dejó el anterior.
// Al drenar (deploy con traslape) se espera a que terminen los que corren AQUÍ.
const gs = globalThis as unknown as { __ebSiteTurnSweep?: ReturnType<typeof setInterval> };
if (!gs.__ebSiteTurnSweep) {
  registerDrain(async () => {
    while ([...live.values()].some((l) => !l.finished)) {
      console.log(`[sites] drenando: ${[...live.values()].filter((l) => !l.finished).length} turno(s) en curso`);
      await new Promise((r) => setTimeout(r, 5_000));
    }
  });
  setTimeout(() => void sweepSiteTurns().catch(() => undefined), 35_000);
  gs.__ebSiteTurnSweep = setInterval(() => void sweepSiteTurns().catch(() => undefined), 60_000);
}

export { TERMINAL as TERMINAL_TURN_EVENTS };
