import { db } from "../db";

// ─────────────────────────────────────────────────────────────────────────────
// Sandbox lifecycle telemetry — INTERVALOS, no muestreo.
//
// Una fila de SandboxSession por caja viva. La abre/sella/cierra la MISMA
// transición que la causa, desde las primitivas del host en sandboxOperations
// (createSandbox / createSandboxRaw / forkSandbox / suspend / resume / destroy).
// De ahí salen, para cualquier owner y cualquier rango, el pico de cajas en
// paralelo y las VM-horas separando running de suspended. El porqué del diseño
// está en el comentario del modelo en prisma/schema.prisma.
//
// REGLA ABSOLUTA de este módulo: NINGUNA función de escritura puede hacer
// fallar a su caller. Todas devuelven Promise<void> y se auto-cachean, así que
// un `void openSandboxSession(...)` en un path de spawn es inofensivo aunque la
// DB esté caída. Hay precedente: un pool.update sin .catch() tumbó producción.
//
// Solo importa `db` a propósito — nada de apiAuth ni sandboxOperations, para no
// crear ciclos con el módulo que lo llama. El reconciliador (que sí necesita
// hablar con el host) vive aparte, en sandboxSessionReconciler.ts.
// ─────────────────────────────────────────────────────────────────────────────

// Interruptor de emergencia: `fly secrets set SANDBOX_SESSIONS=0` apaga toda la
// instrumentación en el primer if de cada función, sin deploy de código.
const ENABLED = process.env.SANDBOX_SESSIONS !== "0";

// Tope de entradas en el array `transitions`. Al llenarse se deja de escribir:
// los acumuladores (que son la fuente de verdad de las VM-horas) siguen exactos
// y el documento no crece sin techo.
const TRANSITIONS_CAP = 40;

export type SandboxSessionKind =
  | "sandbox"
  | "worker"
  | "service"
  | "studio"
  | "embed"
  | "fork"
  | "machine";

export interface SandboxSessionAttrs {
  kind?: SandboxSessionKind;
  fleetAgentId?: string;
  template?: string;
  memMb?: number;
  vcpus?: number;
  persistent?: boolean;
}

/** Todo error de telemetría muere aquí. Nunca sale del módulo. */
function swallow(op: string, sandboxId: string, e: unknown): void {
  console.error(
    `[sandbox-session] ${op} ${sandboxId} failed:`,
    e instanceof Error ? e.message : String(e)
  );
}

/**
 * Abre la sesión de una caja recién creada.
 *
 * Idempotente por sandboxId: cierra como "reconciled" cualquier sesión abierta
 * previa de la misma caja antes de insertar. Cubre el reciclado de ids por el
 * host y un destroy que se haya perdido — sin esto, dos sesiones abiertas del
 * mismo sandboxId contarían doble en el pico de concurrencia.
 */
export async function openSandboxSession(input: {
  ownerId: string;
  sandboxId: string;
  kind?: SandboxSessionKind;
  template?: string;
  memMb?: number;
  vcpus?: number;
  persistent?: boolean;
  fleetAgentId?: string;
  /** El host devuelve createdAt; si viene, gana sobre now(). */
  startedAt?: Date;
}): Promise<void> {
  if (!ENABLED) return;
  if (!input.ownerId || !input.sandboxId) return;
  try {
    const now = new Date();
    // Huérfanas del mismo id: sellarlas antes de abrir la nueva.
    const orphans = await db.sandboxSession.findMany({
      where: { sandboxId: input.sandboxId, endedAt: null },
      select: { id: true },
    });
    for (const o of orphans) {
      await db.sandboxSession.update({
        where: { id: o.id },
        data: { endedAt: now, endReason: "reconciled" },
      });
    }
    const startedAt = input.startedAt ?? now;
    await db.sandboxSession.create({
      data: {
        ownerId: input.ownerId,
        sandboxId: input.sandboxId,
        kind: input.kind ?? "sandbox",
        template: input.template ?? null,
        fleetAgentId: input.fleetAgentId ?? null,
        memMb: input.memMb ?? null,
        vcpus: input.vcpus ?? null,
        persistent: input.persistent ?? false,
        startedAt,
        lastStateAt: startedAt,
        state: "running",
      },
    });
  } catch (e) {
    swallow("open", input.sandboxId, e);
  }
}

/**
 * Núcleo compartido de las tres transiciones: sella el segmento en curso (suma
 * now - lastStateAt al acumulador del estado actual) y aplica el cambio de
 * estado o el cierre. Es la única función que escribe acumuladores.
 */
async function transition(
  sandboxId: string,
  next: { state?: "running" | "suspended"; close?: "destroy" | "reconciled" | "stale" }
): Promise<void> {
  if (!ENABLED) return;
  if (!sandboxId) return;
  try {
    const s = await db.sandboxSession.findFirst({
      where: { sandboxId, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    // Sin sesión abierta: caja creada antes del rollout, o con el flag apagado.
    // No es un error — no hay nada que sellar.
    if (!s) return;

    const now = new Date();
    // Math.max(0, …) blinda contra un step de NTP hacia atrás: un delta negativo
    // corrompería el acumulador de forma permanente.
    const delta = Math.max(0, now.getTime() - s.lastStateAt.getTime());
    const data: Record<string, unknown> = { lastStateAt: now };
    if (s.state === "suspended") data.suspendedMs = s.suspendedMs + delta;
    else data.runningMs = s.runningMs + delta;

    if (next.close) {
      data.endedAt = now;
      data.endReason = next.close;
    } else if (next.state && next.state !== s.state) {
      data.state = next.state;
      if (next.state === "suspended") data.suspendCount = s.suspendCount + 1;
      const log = Array.isArray(s.transitions) ? (s.transitions as unknown[]) : [];
      if (log.length < TRANSITIONS_CAP) {
        data.transitions = [...log, { t: now.toISOString(), s: next.state }];
      }
    } else {
      // Sin cambio real (doble suspend, resume de algo ya running): no escribimos.
      return;
    }
    await db.sandboxSession.update({ where: { id: s.id }, data });
  } catch (e) {
    swallow("transition", sandboxId, e);
  }
}

/** Sella el segmento RUNNING y pasa a suspended. */
export async function markSandboxSuspended(sandboxId: string): Promise<void> {
  return transition(sandboxId, { state: "suspended" });
}

/** Sella el segmento SUSPENDED y vuelve a running. */
export async function markSandboxResumed(sandboxId: string): Promise<void> {
  return transition(sandboxId, { state: "running" });
}

/** Cierra la sesión: sella el segmento en curso y fija endedAt/endReason. */
export async function closeSandboxSession(
  sandboxId: string,
  reason: "destroy" | "reconciled" | "stale" = "destroy"
): Promise<void> {
  return transition(sandboxId, { close: reason });
}

/**
 * Back-fill de atribución desde el caller que SÍ conoce el contexto. Existe
 * porque createSandbox no puede saber el fleetAgentId: spawnVm llama createAgent
 * → createSandbox y solo DESPUÉS sella el fleetAgentId en la fila del Agent.
 *
 * Si esto falla, la sesión se queda con kind:"sandbox": degradación limpia — el
 * intervalo y las VM-horas totales siguen correctos, solo se pierde el desglose.
 */
export async function attributeSandboxSession(
  sandboxId: string,
  attrs: SandboxSessionAttrs
): Promise<void> {
  if (!ENABLED) return;
  if (!sandboxId) return;
  try {
    const s = await db.sandboxSession.findFirst({
      where: { sandboxId, endedAt: null },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });
    if (!s) return;
    const data: Record<string, unknown> = {};
    if (attrs.kind) data.kind = attrs.kind;
    if (attrs.fleetAgentId) data.fleetAgentId = attrs.fleetAgentId;
    if (attrs.template) data.template = attrs.template;
    if (attrs.memMb) data.memMb = attrs.memMb;
    if (attrs.vcpus) data.vcpus = attrs.vcpus;
    if (attrs.persistent !== undefined) data.persistent = attrs.persistent;
    if (!Object.keys(data).length) return;
    await db.sandboxSession.update({ where: { id: s.id }, data });
  } catch (e) {
    swallow("attribute", sandboxId, e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecturas. Un findMany plano + JS: a este volumen no hace falta un aggregation
// pipeline, y el sweep-line en memoria es exacto (no pierde picos entre buckets).
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionInterval {
  sandboxId: string;
  startedAt: Date;
  endedAt: Date | null;
  kind: string;
  template: string | null;
  fleetAgentId: string | null;
  memMb: number | null;
  vcpus: number | null;
  persistent: boolean;
  state: string;
  lastStateAt: Date;
  runningMs: number;
  suspendedMs: number;
}

/**
 * Sesiones que SOLAPAN [from, to). ownerId null = todos los owners (admin).
 * La condición de solapamiento es startedAt < to AND (endedAt = null OR
 * endedAt > from) — una sesión abierta solapa cualquier rango que ya empezó.
 */
export async function listSessionsOverlapping(
  ownerId: string | null,
  from: Date,
  to: Date,
  filter?: { kind?: string; fleetAgentId?: string }
): Promise<SessionInterval[]> {
  const rows = await db.sandboxSession.findMany({
    where: {
      ...(ownerId ? { ownerId } : {}),
      startedAt: { lt: to },
      OR: [{ endedAt: null }, { endedAt: { gt: from } }],
      ...(filter?.kind ? { kind: filter.kind } : {}),
      ...(filter?.fleetAgentId ? { fleetAgentId: filter.fleetAgentId } : {}),
    },
    orderBy: { startedAt: "asc" },
  });
  return rows as unknown as SessionInterval[];
}

export interface ConcurrencyPoint {
  at: Date;
  count: number;
}

export interface ConcurrencyReport {
  /** Máximo de cajas simultáneas en el rango. */
  peak: number;
  peakAt: Date | null;
  /** Un punto POR CAMBIO (no por bucket fijo): exacto y compacto. */
  series: ConcurrencyPoint[];
  totalSessions: number;
}

/**
 * El barrido sweep-line, PURO (sin DB) para poder probarlo. Cuenta cuántos
 * intervalos se solapan en cada instante de [from, to).
 *
 * `now` se inyecta en vez de leerlo aquí para que el resultado sea determinista
 * en los tests: las sesiones abiertas (endedAt=null) se extienden hasta
 * min(now, to).
 */
export function computeConcurrency(
  rows: Pick<SessionInterval, "startedAt" | "endedAt">[],
  from: Date,
  to: Date,
  now: number
): ConcurrencyReport {
  const events: { t: number; d: 1 | -1 }[] = [];
  for (const r of rows) {
    const start = Math.max(r.startedAt.getTime(), from.getTime());
    // Sesión abierta = viva hasta min(now, to).
    const rawEnd = r.endedAt ? r.endedAt.getTime() : Math.min(now, to.getTime());
    const end = Math.min(rawEnd, to.getTime());
    if (end <= start) continue;
    events.push({ t: start, d: 1 }, { t: end, d: -1 });
  }
  // A igual timestamp los CIERRES van primero: si no, una caja que muere en el
  // instante exacto en que nace otra inflaría el pico con un +1 fantasma.
  events.sort((a, b) => a.t - b.t || a.d - b.d);

  let cur = 0;
  let peak = 0;
  let peakAt: Date | null = null;
  const series: ConcurrencyPoint[] = [];
  for (let i = 0; i < events.length; i++) {
    cur += events[i].d;
    // Colapsa todos los eventos del mismo instante en un solo punto de la serie.
    if (events[i + 1]?.t === events[i].t) continue;
    series.push({ at: new Date(events[i].t), count: cur });
    if (cur > peak) {
      peak = cur;
      peakAt = new Date(events[i].t);
    }
  }
  return { peak, peakAt, series, totalSessions: rows.length };
}

/**
 * Pico y serie de concurrencia por owner. "¿Cuántas cajas el lunes 27 a las
 * 11am?" = ownerConcurrency(id, lunes11:00, lunes11:01).peak
 */
export async function ownerConcurrency(
  ownerId: string,
  from: Date,
  to: Date,
  opts?: { kind?: string; fleetAgentId?: string }
): Promise<ConcurrencyReport> {
  const rows = await listSessionsOverlapping(ownerId, from, to, opts);
  return computeConcurrency(rows, from, to, Date.now());
}

export interface VmHoursReport {
  runningHours: number;
  suspendedHours: number;
  /** Σ(horas × memMb): el denominador real del costo, la RAM es lo escaso. */
  runningMbHours: number;
  suspendedMbHours: number;
  sessions: number;
  byKind: Record<
    string,
    { runningHours: number; suspendedHours: number; sessions: number }
  >;
}

/**
 * VM-horas de un owner en un rango, separando running de suspended (cuestan
 * distinto: suspendida es disco + snapshot, corriendo es RAM de Firecracker).
 *
 * Los acumuladores son de TODA la vida de la caja, así que para un rango parcial
 * se prorratea por la fracción del intervalo que cae dentro. Es una aproximación
 * DELIBERADA: el reparto running/suspended exacto por rango exigiría la tabla de
 * segmentos que se descartó, y el error solo aparece en las cajas que cruzan el
 * borde del rango.
 */
export async function ownerVmHours(
  ownerId: string,
  from: Date,
  to: Date
): Promise<VmHoursReport> {
  const rows = await listSessionsOverlapping(ownerId, from, to);
  const now = Date.now();
  const out: VmHoursReport = {
    runningHours: 0,
    suspendedHours: 0,
    runningMbHours: 0,
    suspendedMbHours: 0,
    sessions: rows.length,
    byKind: {},
  };
  const H = 3_600_000;
  for (const r of rows) {
    const endMs = r.endedAt ? r.endedAt.getTime() : now;
    // Acumuladores SELLADOS + el segmento EN CURSO: sin esto, una caja viva desde
    // hace 6h sin transiciones reportaría cero horas.
    const tip = Math.max(0, Math.min(now, endMs) - r.lastStateAt.getTime());
    let running = r.runningMs;
    let suspended = r.suspendedMs;
    if (r.state === "suspended") suspended += tip;
    else running += tip;

    const lifeMs = endMs - r.startedAt.getTime();
    const inMs = Math.max(
      0,
      Math.min(endMs, to.getTime()) - Math.max(r.startedAt.getTime(), from.getTime())
    );
    const f = lifeMs > 0 ? Math.min(1, inMs / lifeMs) : 0;

    const rh = (running * f) / H;
    const sh = (suspended * f) / H;
    out.runningHours += rh;
    out.suspendedHours += sh;
    out.runningMbHours += rh * (r.memMb ?? 0);
    out.suspendedMbHours += sh * (r.memMb ?? 0);
    const k = (out.byKind[r.kind] ??= {
      runningHours: 0,
      suspendedHours: 0,
      sessions: 0,
    });
    k.runningHours += rh;
    k.suspendedHours += sh;
    k.sessions += 1;
  }
  return out;
}

/**
 * Purga de histórico. NO está enganchada a nada: al volumen estimado (~0.4-1.8M
 * filas/año, ~200-700MB) Mongo aguanta el primer año sin despeinarse y las
 * queries siempre van filtradas por (ownerId, startedAt). Queda escrita para el
 * día que haga falta — un `if (tick % 1440 === 0)` en el heartbeat.
 * Nunca borra sesiones abiertas.
 */
export async function purgeSandboxSessions(before: Date): Promise<number> {
  const res = await db.sandboxSession.deleteMany({
    where: { endedAt: { lt: before } },
  });
  return res.count;
}
