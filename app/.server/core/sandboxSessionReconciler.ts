import { db } from "../db";
import { getSandbox, listSandboxes } from "./sandboxOperations";
import { ctxForOwner } from "./fleetAgentOperations";
import {
  closeSandboxSession,
  markSandboxResumed,
  markSandboxSuspended,
} from "./sandboxSessions";

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliador de sesiones huérfanas.
//
// Cuando el host mata una VM por su cuenta (TTL, crash, reinicio del host), el
// destroySandbox de EasyBits nunca corre y la SandboxSession queda ABIERTA para
// siempre. Una sesión abierta cuenta como caja viva en el barrido de
// concurrencia, así que sin esto el pico del reporte se infla sin techo.
//
// Vive aparte de sandboxSessions.ts a propósito: este módulo SÍ habla con el
// host (sandboxOperations), y el módulo de escritura debe seguir sin esa
// dependencia para no crear un ciclo con quien lo llama.
//
// Este barrido SOLO LEE del host — nunca destruye ni suspende nada. El peor bug
// posible aquí es telemetría incorrecta, jamás una VM muerta.
// ─────────────────────────────────────────────────────────────────────────────

// Una caja recién creada puede no aparecer todavía en el listing del host
// (status "starting"). Cerrar su sesión ahí sería inventarle una muerte y
// falsear el pico a la baja, así que no se tocan las sesiones más nuevas que esto.
const GRACE_MS = 90_000;

// Sesión abierta más vieja que esto sin ninguna señal = basura (el proceso murió
// a media vida de la caja, o el host entero se fue). Se cierra como "stale" sin
// preguntarle al host, para que una caja fantasma de semanas no domine el pico.
const MAX_SESSION_MS = (Number(process.env.SANDBOX_SESSION_MAX_H) || 72) * 3_600_000;

// Una suspendida recién dormida no puede haber muerto sin que nos enteráramos.
// Solo se sondean (1 llamada por caja) las que llevan dormidas más que esto.
const SUSPENDED_PROBE_MS = 10 * 60_000;

// Dry-run: barre y loguea lo que HARÍA sin escribir nada. Sirve para validar en
// prod, durante 24h, que el supuesto sobre el listing del host es correcto antes
// de dejar que cierre sesiones de verdad.
const DRY = process.env.SANDBOX_RECONCILE_DRY === "1";

export interface ReconcileResult {
  checked: number;
  closed: number;
  resumedFixed: number;
  suspendedFixed: number;
}

export async function reconcileSandboxSessions(): Promise<ReconcileResult> {
  const out: ReconcileResult = { checked: 0, closed: 0, resumedFixed: 0, suspendedFixed: 0 };
  const now = Date.now();

  const open = await db.sandboxSession.findMany({
    where: { endedAt: null, startedAt: { lt: new Date(now - GRACE_MS) } },
  });
  if (!open.length) return out;
  out.checked = open.length;

  // Agrupar por owner: el listing del host es owner-scoped, una llamada por owner.
  const byOwner = new Map<string, typeof open>();
  for (const s of open) {
    const list = byOwner.get(s.ownerId) ?? [];
    list.push(s);
    byOwner.set(s.ownerId, list);
  }

  for (const [ownerId, sessions] of byOwner) {
    // Stale primero: no necesita al host, así que sobrevive a un host caído.
    const fresh: typeof sessions = [];
    for (const s of sessions) {
      if (now - s.startedAt.getTime() > MAX_SESSION_MS) {
        if (DRY) console.log(`[reconcile:dry] stale ${s.sandboxId} (${s.state})`);
        else await closeSandboxSession(s.sandboxId, "stale");
        out.closed++;
      } else {
        fresh.push(s);
      }
    }
    if (!fresh.length) continue;

    const ctx = await ctxForOwner(ownerId).catch(() => null);
    if (!ctx) continue;
    const list = await listSandboxes(ctx).catch(() => null);
    // FAIL-CLOSED: si el host no responde, NO concluimos que las cajas murieron.
    // Se reintenta en el siguiente barrido.
    if (!Array.isArray(list)) continue;
    const live = new Map(list.map((v) => [v.sandboxId, v.status]));

    for (const s of fresh) {
      const hostStatus = live.get(s.sandboxId);

      if (s.state === "running") {
        if (hostStatus === "suspended") {
          // El host la durmió solo (suspendOnIdle host-managed): nuestro
          // suspendSandbox nunca corrió. Se mide igual.
          if (DRY) console.log(`[reconcile:dry] host-suspended ${s.sandboxId}`);
          else await markSandboxSuspended(s.sandboxId);
          out.suspendedFixed++;
          continue;
        }
        if (hostStatus) continue; // viva y corriendo, nada que hacer
        // Ausente del listing. El host OMITE las suspendidas de su listing (ver
        // el conteo inUse = live + suspended en spawnVm), así que ausencia NO es
        // prueba de muerte: se confirma con un GET individual antes de cerrar.
        const rec = await getSandbox(ctx, s.sandboxId).catch(() => null);
        if (!rec) {
          if (DRY) console.log(`[reconcile:dry] close ${s.sandboxId} (running, 404)`);
          else await closeSandboxSession(s.sandboxId, "reconciled");
          out.closed++;
        } else if (rec.status === "suspended") {
          if (DRY) console.log(`[reconcile:dry] host-suspended ${s.sandboxId}`);
          else await markSandboxSuspended(s.sandboxId);
          out.suspendedFixed++;
        }
        continue;
      }

      // state === "suspended": el listing no dice nada de las dormidas.
      if (hostStatus && hostStatus !== "suspended") {
        // Alguien la despertó fuera de nuestras primitivas. Auto-corrección.
        if (DRY) console.log(`[reconcile:dry] resumed ${s.sandboxId}`);
        else await markSandboxResumed(s.sandboxId);
        out.resumedFixed++;
        continue;
      }
      if (now - s.lastStateAt.getTime() < SUSPENDED_PROBE_MS) continue;
      const rec = await getSandbox(ctx, s.sandboxId).catch(() => null);
      if (!rec) {
        if (DRY) console.log(`[reconcile:dry] close ${s.sandboxId} (suspended, 404)`);
        else await closeSandboxSession(s.sandboxId, "reconciled");
        out.closed++;
      } else if (rec.status === "running") {
        if (DRY) console.log(`[reconcile:dry] resumed ${s.sandboxId}`);
        else await markSandboxResumed(s.sandboxId);
        out.resumedFixed++;
      }
    }
  }

  if (out.closed || out.resumedFixed || out.suspendedFixed) {
    console.log(
      `[sandbox-session] reconcile${DRY ? ":dry" : ""}`,
      JSON.stringify(out)
    );
  }
  return out;
}
