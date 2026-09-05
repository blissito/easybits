/**
 * Decisión de admisión de la flota — módulo PURO (cero I/O).
 *
 * Existe porque la política vivía inline dentro de `spawnVm` y era, por eso, imposible
 * de testear sin Mongo ni host: no había ni un solo test de capacidad pese a ser el
 * camino que decide si un agente arranca o no.
 *
 * El bug que motivó separarla: el gate cuenta cajas por CUENTA (todas las del owner en
 * el host) pero el desalojo sólo buscaba víctimas dentro del MISMO fleet. Cuando la
 * saturación la causaban otras cajas del owner, no había víctima elegible y el agente
 * se quedaba fuera para siempre. Sin saber POR QUÉ se negó la admisión no se puede
 * elegir el ámbito del desalojo — de ahí `reason`.
 */

export type CapacitySnapshot = {
  /** Cajas que el plan + add-ons permiten al DUEÑO (no al agente). */
  accountBudget: number;
  /** Cajas vivas del owner (running/starting), en TODO el host. */
  liveOwner: number;
  /** Cajas suspendidas del owner. Una suspendida es capacidad reservada real. */
  suspendedOwner: number;
  /** Cajas de servicio (voice/render) del owner: consumen budget y no son workers. */
  serviceBoxes: number;
  /** VMs de ESTE fleet (running/building/suspended), contra su propio cap. */
  fleetVms: number;
  /** Cap del fleet (`FleetAgent.maxVms`). */
  maxVms: number;
  /**
   * false cuando el listado del host falló y los números salen sólo de la DB. En ese
   * caso se admite de forma conservadora: durante un incidente del host es preferible
   * encolar que sobre-admitir y saturar el fierro.
   */
  countsTrusted: boolean;
};

export type AdmitReason = "account" | "fleet" | "ram";

export type AdmitDecision =
  | { ok: true }
  | { ok: false; reason: AdmitReason; detail: string };

/** Cajas del owner que consumen su presupuesto de cuenta. */
export function accountInUse(s: CapacitySnapshot): number {
  return s.liveOwner + s.suspendedOwner + s.serviceBoxes;
}

export function admit(s: CapacitySnapshot): AdmitDecision {
  // Dos límites DISTINTOS que antes se colapsaban en `Math.min(budget, maxVms)`, lo
  // que comparaba un contador de cuenta contra un cap de fleet: con dos agentes, el
  // uso global se medía contra el cap de cada uno y se negaba admisión de más.
  const inUse = accountInUse(s);
  // Con conteos poco fiables se reserva un slot de margen (nunca por debajo de 1
  // caja: un plan de 1 seguiría pudiendo arrancar su único agente).
  const effectiveBudget = s.countsTrusted
    ? s.accountBudget
    : Math.max(1, s.accountBudget - 1);

  if (inUse >= effectiveBudget) {
    return {
      ok: false,
      reason: "account",
      detail: `account at sandbox budget (${inUse}/${s.accountBudget}${s.countsTrusted ? "" : ", conteo degradado"})`,
    };
  }
  if (s.fleetVms >= s.maxVms) {
    return {
      ok: false,
      reason: "fleet",
      detail: `fleet agent at its own cap (${s.fleetVms}/${s.maxVms})`,
    };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranking de candidatos a desalojo
// ─────────────────────────────────────────────────────────────────────────────

export type ReclaimCandidate = {
  id: string;
  /** "service" = caja de voice/render; "worker" = VM de conversación. */
  kind: "service" | "worker";
  /** Sólo workers: a qué fleet pertenece (para no desalojar el propio antes de tiempo). */
  fleetAgentId?: string | null;
  /** Última actividad. Más antiguo = mejor víctima. */
  lastActiveAt?: Date | null;
  /** Sólo se consideran cajas dormidas: nunca se corta un turno en vuelo. */
  suspended: boolean;
  /** VMs con un turno vivo o reservadas como spare caliente. */
  busy?: boolean;
};

/**
 * Ordena víctimas por daño creciente:
 *   1. cajas de servicio dormidas (no tienen conversación que respaldar),
 *   2. workers dormidos, el menos reciente primero.
 * Excluye lo que está ocupado o despierto — desalojar una caja viva cortaría el turno
 * de otro tenant del mismo dueño, que es el peor resultado posible de este código.
 */
export function rankReclaimCandidates(
  candidates: ReclaimCandidate[],
  opts?: { excludeFleetAgentId?: string | null }
): ReclaimCandidate[] {
  const age = (c: ReclaimCandidate) => c.lastActiveAt?.getTime() ?? 0;
  return candidates
    .filter((c) => c.suspended && !c.busy)
    .filter((c) =>
      opts?.excludeFleetAgentId ? c.fleetAgentId !== opts.excludeFleetAgentId : true
    )
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "service" ? -1 : 1;
      return age(a) - age(b);
    });
}
