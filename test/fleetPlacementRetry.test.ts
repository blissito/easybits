import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * El fierro es la fuente de verdad; la fila de Mongo es un caché. Cuando una caja
 * suspendida se EVAPORA (rebake, restart del host, barrido), su resume responde
 * 404 y `ensureRunning` se auto-cura: marca la fila `lost` y suelta la ruta.
 *
 * Hasta el 2026-08-18 el caller lanzaba ahí mismo `failed to start`, así que la
 * curación llegaba un turno TARDE: por HTTP el turno se perdía entero y el
 * usuario tenía que reescribir lo que ya había pedido (reportado por denik).
 *
 * Este test fija que la colocación reintenta EN EL SITIO y conserva el hilo.
 */

// ── Fake DB en memoria: el reintento depende de que la caja muerta pase a `lost`
// y quede FUERA del filtro de candidatas, así que el estado tiene que mutar. ──
type Agent = { id: string; sandboxId: string; fleetAgentId: string; status: string };
type Route = {
  id: string;
  fleetAgentId: string;
  groupId: string;
  agentId: string | null;
  sessionUuid: string;
  createdAt: Date;
  lastMessageAt: Date;
  detachedAt: Date | null;
};

let agents: Agent[] = [];
let routes: Route[] = [];

const db = {
  agent: {
    findUnique: async ({ where }: any) => agents.find((a) => a.id === where.id) ?? null,
    findUniqueOrThrow: async ({ where }: any) => {
      const a = agents.find((x) => x.id === where.id);
      if (!a) throw new Error(`agent ${where.id} not found`);
      return a;
    },
    findMany: async ({ where }: any) =>
      agents.filter(
        (a) => a.fleetAgentId === where.fleetAgentId && where.status.in.includes(a.status)
      ),
    update: async ({ where, data }: any) => {
      const a = agents.find((x) => x.id === where.id)!;
      Object.assign(a, data);
      return a;
    },
    updateMany: async ({ where, data }: any) => {
      for (const a of agents.filter((x) => x.id === where.id)) Object.assign(a, data);
      return { count: 1 };
    },
  },
  fleetAgentRoute: {
    findUnique: async ({ where }: any) => {
      const k = where.fleetAgentId_groupId;
      return routes.find((r) => r.fleetAgentId === k.fleetAgentId && r.groupId === k.groupId) ?? null;
    },
    count: async ({ where }: any) => routes.filter((r) => r.agentId === where.agentId).length,
    update: async ({ where, data }: any) => {
      const r = routes.find((x) => x.id === where.id)!;
      Object.assign(r, data);
      return r;
    },
    updateMany: async ({ where, data }: any) => {
      for (const r of routes.filter((x) => x.agentId === where.agentId)) Object.assign(r, data);
      return { count: 1 };
    },
    create: async ({ data }: any) => {
      const r = { id: `route-${routes.length}`, detachedAt: null, createdAt: new Date(), lastMessageAt: new Date(), ...data };
      routes.push(r);
      return r;
    },
  },
};

const resumeSandbox = vi.fn();

vi.mock("~/.server/db", () => ({ db }));
vi.mock("~/.server/core/sandboxOperations", () => ({
  resumeSandbox: (...a: unknown[]) => resumeSandbox(...a),
  createAgent: vi.fn(),
  suspendSandbox: vi.fn(),
  destroySandbox: vi.fn(),
  openAgentChunkStream: vi.fn(),
  execCommand: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  listSandboxes: vi.fn(async () => []),
}));
// restoreConversation va envuelto en .catch() en el caller; sin storage devuelve
// false y no estorba, pero lo neutralizamos para no salir a la red.
vi.mock("~/.server/storage", () => ({
  getPlatformDefaultClient: () => ({ getReadUrl: async () => null }),
  buildPublicAssetUrl: (k: string) => k,
}));

const { pickOrSpawn } = await import("~/.server/core/fleetAgentOperations");

const FLEET = { id: "fa1", maxWorkersPerVm: 4, maxVms: 5 } as any;
const CTX = { user: { id: "u1" }, scopes: ["READ", "WRITE", "DELETE"] } as any;

/** Caja evaporada: el host responde 404 al intentar despertarla. */
function boxIsGone(sandboxId: string) {
  resumeSandbox.mockImplementation(async (_ctx: unknown, sb: string) => {
    if (sb === sandboxId) throw new Error(`sandbox host GET /v1/sandbox/${sb} → 404: {"error":"sandbox not found"}`);
  });
}

describe("pickOrSpawn — una caja evaporada no cuesta el turno", () => {
  beforeEach(() => {
    resumeSandbox.mockReset();
    agents = [
      { id: "agent-dead", sandboxId: "sb_dead", fleetAgentId: "fa1", status: "suspended" },
      { id: "agent-ok", sandboxId: "sb_ok", fleetAgentId: "fa1", status: "suspended" },
    ];
    routes = [
      {
        id: "route-1",
        fleetAgentId: "fa1",
        groupId: "web-1",
        agentId: "agent-dead",
        sessionUuid: "sess-abc",
        createdAt: new Date(),
        lastMessageAt: new Date(),
        detachedAt: null,
      },
    ];
  });

  it("reintenta sobre una VM sana en vez de perder el turno", async () => {
    boxIsGone("sb_dead");
    const placed = await pickOrSpawn(CTX, FLEET, "web-1");
    expect(placed.vm.id).toBe("agent-ok");
    expect(placed.vm.status).toBe("running");
  });

  it("conserva el sessionUuid: el usuario no pierde el hilo", async () => {
    boxIsGone("sb_dead");
    const placed = await pickOrSpawn(CTX, FLEET, "web-1");
    // Misma sesión ⇒ restoreConversation la recupera sobre la caja nueva.
    expect(placed.sessionUuid).toBe("sess-abc");
  });

  it("marca la caja evaporada como `lost` y la desata de la ruta", async () => {
    boxIsGone("sb_dead");
    await pickOrSpawn(CTX, FLEET, "web-1");
    expect(agents.find((a) => a.id === "agent-dead")!.status).toBe("lost");
    // La ruta acabó apuntando a la caja sana, no a la muerta.
    expect(routes[0].agentId).toBe("agent-ok");
  });

  // El tope existe para que un fierro caído no se convierta en un bucle de
  // respawn: se intenta una vez más, no indefinidamente.
  it("si TODAS las cajas están evaporadas, falla tras 2 intentos", async () => {
    resumeSandbox.mockRejectedValue(new Error('sandbox host → 404: {"error":"sandbox not found"}'));
    await expect(pickOrSpawn(CTX, FLEET, "web-1")).rejects.toThrow(/failed to start/);
    expect(resumeSandbox).toHaveBeenCalledTimes(2);
  });

  it("sin fallo no reintenta: una colocación normal despierta UNA caja", async () => {
    resumeSandbox.mockResolvedValue(undefined);
    const placed = await pickOrSpawn(CTX, FLEET, "web-1");
    expect(placed.vm.id).toBe("agent-dead"); // la ruta ya apuntaba aquí; despertó bien
    expect(resumeSandbox).toHaveBeenCalledTimes(1);
  });
});
