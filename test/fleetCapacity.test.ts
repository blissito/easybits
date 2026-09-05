import { describe, it, expect } from "vitest";
import {
  admit,
  accountInUse,
  rankReclaimCandidates,
  type CapacitySnapshot,
  type ReclaimCandidate,
} from "~/.server/core/fleetCapacity";

const snap = (o: Partial<CapacitySnapshot> = {}): CapacitySnapshot => ({
  accountBudget: 2,
  liveOwner: 0,
  suspendedOwner: 0,
  serviceBoxes: 0,
  fleetVms: 0,
  maxVms: 10,
  countsTrusted: true,
  ...o,
});

describe("admisión", () => {
  it("admite cuando hay sitio", () => {
    expect(admit(snap({ liveOwner: 1 })).ok).toBe(true);
  });

  it("una caja SUSPENDIDA sigue ocupando presupuesto", () => {
    // El host omite las suspendidas de su listado. Contarlas sólo por 'running' era
    // explotable: llenas, dejas que el reaper las duerma y vuelves a spawnear encima.
    const d = admit(snap({ liveOwner: 1, suspendedOwner: 1 }));
    expect(d.ok).toBe(false);
    expect(d.ok === false && d.reason).toBe("account");
  });

  it("las cajas de servicio cuentan contra el presupuesto", () => {
    const d = admit(snap({ liveOwner: 1, serviceBoxes: 1 }));
    expect(d.ok).toBe(false);
    expect(d.ok === false && d.reason).toBe("account");
  });

  it("distingue saturación de CUENTA de saturación del propio FLEET", () => {
    // Es la distinción que hace posible elegir el desalojo correcto.
    const cuenta = admit(snap({ accountBudget: 2, liveOwner: 2 }));
    expect(cuenta.ok === false && cuenta.reason).toBe("account");

    const fleet = admit(snap({ accountBudget: 10, liveOwner: 3, fleetVms: 4, maxVms: 4 }));
    expect(fleet.ok === false && fleet.reason).toBe("fleet");
  });

  it("NO niega por mezclar el uso de la cuenta con el cap del fleet", () => {
    // Antes era `inUse >= Math.min(budget, maxVms)`: con maxVms bajo y cuenta holgada
    // se negaba admisión aunque ni la cuenta ni el fleet estuvieran llenos.
    expect(admit(snap({ accountBudget: 10, liveOwner: 3, fleetVms: 0, maxVms: 2 })).ok).toBe(true);
  });

  it("con conteos degradados admite de forma conservadora", () => {
    // Si el host no responde, sobre-admitir satura el fierro justo durante el incidente.
    expect(admit(snap({ accountBudget: 3, liveOwner: 2, countsTrusted: true })).ok).toBe(true);
    const degradado = admit(snap({ accountBudget: 3, liveOwner: 2, countsTrusted: false }));
    expect(degradado.ok).toBe(false);
  });

  it("un plan de una sola caja sigue pudiendo arrancar su agente aunque el conteo falle", () => {
    expect(admit(snap({ accountBudget: 1, liveOwner: 0, countsTrusted: false })).ok).toBe(true);
  });

  it("accountInUse suma vivas, dormidas y de servicio", () => {
    expect(accountInUse(snap({ liveOwner: 1, suspendedOwner: 2, serviceBoxes: 3 }))).toBe(6);
  });
});

describe("ranking de víctimas de desalojo", () => {
  const old = new Date("2026-01-01");
  const recent = new Date("2026-09-01");

  it("nunca elige una caja despierta ni una ocupada", () => {
    const c: ReclaimCandidate[] = [
      { id: "awake", kind: "worker", suspended: false, lastActiveAt: old },
      { id: "busy", kind: "worker", suspended: true, busy: true, lastActiveAt: old },
    ];
    // Cortar un turno en vuelo de otro tenant del mismo dueño es el peor resultado
    // posible de este código.
    expect(rankReclaimCandidates(c)).toHaveLength(0);
  });

  it("prefiere una caja de servicio antes que un worker con conversación", () => {
    const c: ReclaimCandidate[] = [
      { id: "worker", kind: "worker", suspended: true, lastActiveAt: old },
      { id: "svc", kind: "service", suspended: true, lastActiveAt: recent },
    ];
    expect(rankReclaimCandidates(c)[0].id).toBe("svc");
  });

  it("entre workers elige el menos reciente (LRU)", () => {
    const c: ReclaimCandidate[] = [
      { id: "nuevo", kind: "worker", suspended: true, lastActiveAt: recent },
      { id: "viejo", kind: "worker", suspended: true, lastActiveAt: old },
    ];
    expect(rankReclaimCandidates(c)[0].id).toBe("viejo");
  });

  it("excluye el fleet solicitante — sus cajas las recicla el camino intra-fleet", () => {
    const c: ReclaimCandidate[] = [
      { id: "propia", kind: "worker", fleetAgentId: "yo", suspended: true, lastActiveAt: old },
      { id: "ajena", kind: "worker", fleetAgentId: "otro", suspended: true, lastActiveAt: recent },
    ];
    const r = rankReclaimCandidates(c, { excludeFleetAgentId: "yo" });
    expect(r.map((x) => x.id)).toEqual(["ajena"]);
  });

  it("sin candidatos reclamables devuelve vacío (back-pressure legítima)", () => {
    expect(rankReclaimCandidates([])).toHaveLength(0);
  });
});
