// Ciclo de vida del proceso para deploys SIN caída (app-host con traslape azul/verde).
//
// Durante un deploy corren dos instancias a la vez: la nueva ya atiende y la vieja drena.
// Eso exige dos cosas que antes no existían:
//  1. Liderazgo (AppLease): lo que no se puede duplicar —los sockets de WhatsApp, que pelean
//     la misma sesión, y el reaper de la flota— sólo corre en el dueño del lease.
//  2. Drenado ordenado en SIGTERM (server.mjs llama a __ebDrain): no aceptar turnos nuevos,
//     cerrar lo único y soltar el lease ENSEGUIDA (WhatsApp no espera a los turnos largos) y
//     después esperar los turnos de Sitios antes de salir.
import { db } from "~/.server/db";

const LEASE_ID = "singletons";
const LEASE_TTL_MS = 30_000;
const LEASE_RENEW_MS = 10_000;
const SINGLETON_DRAIN_MS = 60_000;

export const INSTANCE = `${process.env.APP_COLOR ?? "app"}:${process.pid}:${Date.now().toString(36)}`;

type DrainFn = () => Promise<void>;
type State = {
  leader: boolean;
  draining: boolean;
  started: boolean;
  singletonDrains: DrainFn[];
  drains: DrainFn[];
};
const g = globalThis as unknown as { __ebLifecycle?: State; __ebDrain?: (capMs: number) => Promise<void> };
const st = (g.__ebLifecycle ??= { leader: false, draining: false, started: false, singletonDrains: [], drains: [] });

export const isLeader = () => st.leader;
export const isDraining = () => st.draining;

/** Algo a esperar al drenar. `singleton`: corre antes de soltar el lease (WhatsApp, reaper). */
export function registerDrain(fn: DrainFn, opts: { singleton?: boolean } = {}) {
  (opts.singleton ? st.singletonDrains : st.drains).push(fn);
}

/** El servidor de dev apunta a la base de PRODUCCIÓN: nunca debe tomar el lease. */
function leaseEnabled() {
  return process.env.NODE_ENV === "production" && process.env.EB_BACKGROUND !== "off";
}

async function tryLease(): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LEASE_TTL_MS);
  const { count } = await db.appLease.updateMany({
    where: { id: LEASE_ID, OR: [{ holder: INSTANCE }, { expiresAt: { lt: now } }] },
    data: { holder: INSTANCE, expiresAt },
  });
  if (count === 1) return true;
  // Primera vez: no hay fila. Si otra instancia la crea al mismo tiempo, una pierde (P2002).
  const exists = await db.appLease.findUnique({ where: { id: LEASE_ID }, select: { id: true } });
  if (exists) return false;
  return db.appLease
    .create({ data: { id: LEASE_ID, holder: INSTANCE, expiresAt } })
    .then(() => true)
    .catch(() => false);
}

async function tick() {
  if (st.draining) return;
  const got = await tryLease().catch((e) => {
    console.error("[lifecycle] lease", e instanceof Error ? e.message : e);
    return st.leader; // sin base no se suelta a ciegas: el TTL decide
  });
  if (got && !st.leader) {
    st.leader = true;
    console.log(`[lifecycle] ${INSTANCE} es líder: levanto WhatsApp y el reaper`);
    void import("~/.server/integrations/whatsapp/baileys.server")
      .then((m) => m.ensureRehydrated())
      .catch((e) => console.error("[lifecycle] rehidratar", e));
  } else if (!got && st.leader) {
    // Otro tomó el lease (este proceso se colgó más de 30 s): dejar de actuar como líder.
    st.leader = false;
    console.warn(`[lifecycle] ${INSTANCE} perdió el liderazgo`);
  }
}

/** Arranca el ciclo de liderazgo. Idempotente. */
export function startLifecycle() {
  if (st.started) return;
  st.started = true;
  g.__ebDrain = drain;
  if (!leaseEnabled()) return;
  void tick();
  setInterval(() => void tick(), LEASE_RENEW_MS).unref();
}

async function withCap(p: Promise<unknown>, ms: number) {
  await Promise.race([p.catch(() => undefined), new Promise((r) => setTimeout(r, ms))]);
}

/** SIGTERM: ver el encabezado. `capMs` = tope total que da quien nos va a matar. */
async function drain(capMs: number) {
  if (st.draining) return;
  st.draining = true;
  const deadline = Date.now() + capMs;
  console.log(`[lifecycle] ${INSTANCE} drenando (tope ${Math.round(capMs / 1000)} s)`);
  await withCap(Promise.all(st.singletonDrains.map((fn) => fn())), Math.min(SINGLETON_DRAIN_MS, capMs));
  if (st.leader) {
    st.leader = false;
    await db.appLease
      .updateMany({ where: { id: LEASE_ID, holder: INSTANCE }, data: { expiresAt: new Date(0) } })
      .catch(() => undefined);
    console.log(`[lifecycle] ${INSTANCE} soltó el liderazgo`);
  }
  await withCap(Promise.all(st.drains.map((fn) => fn())), Math.max(0, deadline - Date.now()));
  console.log(`[lifecycle] ${INSTANCE} drenado`);
}
