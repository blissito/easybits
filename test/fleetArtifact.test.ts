import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Artifact por FleetAgent (plantilla derivada del host) y env por resume.
 *
 * Separación eve-style: el ARTIFACT es el disco (template + seeds + skills), se captura
 * UNA vez y se reutiliza mientras su hash no cambie; las OPEN OPTIONS (prompt, modelo,
 * credenciales) viajan por env en cada create/resume y NUNCA invalidan el artifact.
 */

// ── Fake DB en memoria ──
type Agent = {
  id: string;
  sandboxId: string;
  ownerId: string;
  template: string;
  embedToken: string;
  fleetAgentId: string | null;
  status: string;
  spawnEnvHash?: string | null;
  lastMessageAt: Date;
};
let agents: Agent[] = [];
let routes: any[] = [];
let fleetAgents: Record<string, any> = {};

const matchesStatus = (a: Agent, w: any) =>
  !w.status || (typeof w.status === "string" ? a.status === w.status : w.status.in.includes(a.status));
const matchesAgent = (a: Agent, w: any) =>
  matchesStatus(a, w) &&
  (w.fleetAgentId === undefined ||
    (typeof w.fleetAgentId === "string" ? a.fleetAgentId === w.fleetAgentId : a.fleetAgentId !== w.fleetAgentId.not)) &&
  (w.ownerId === undefined || a.ownerId === w.ownerId) &&
  (w.template === undefined || a.template === w.template) &&
  (!w.id?.notIn || !w.id.notIn.includes(a.id));

const db = {
  agent: {
    findUnique: async ({ where }: any) => agents.find((a) => a.id === where.id) ?? null,
    findUniqueOrThrow: async ({ where }: any) => {
      const a = agents.find((x) => x.id === where.id);
      if (!a) throw new Error(`agent ${where.id} not found`);
      return a;
    },
    findFirst: async ({ where }: any) =>
      agents.filter((a) => matchesAgent(a, where)).sort((x, y) => +x.lastMessageAt - +y.lastMessageAt)[0] ?? null,
    findMany: async ({ where }: any) => agents.filter((a) => matchesAgent(a, where)),
    count: async ({ where }: any) => agents.filter((a) => matchesAgent(a, where)).length,
    update: async ({ where, data }: any) => {
      const a = agents.find((x) => x.id === where.id)!;
      Object.assign(a, data);
      return a;
    },
    updateMany: async ({ where, data }: any) => {
      const hit = agents.filter((a) => a.id === where.id);
      for (const a of hit) Object.assign(a, data);
      return { count: hit.length };
    },
    delete: async ({ where }: any) => {
      agents = agents.filter((a) => a.id !== where.id);
    },
  },
  fleetAgentRoute: {
    findUnique: async ({ where }: any) => {
      const k = where.fleetAgentId_groupId;
      return routes.find((r) => r.fleetAgentId === k.fleetAgentId && r.groupId === k.groupId) ?? null;
    },
    findFirst: async () => null,
    findMany: async ({ where }: any) => routes.filter((r) => r.agentId === where.agentId),
    count: async ({ where }: any) => routes.filter((r) => r.agentId === where.agentId).length,
    update: async ({ where, data }: any) => {
      const r = routes.find((x) => x.id === where.id)!;
      Object.assign(r, data);
      return r;
    },
    updateMany: async ({ where, data }: any) => {
      const hit = routes.filter((x) => x.agentId === where.agentId);
      for (const r of hit) Object.assign(r, data);
      return { count: hit.length };
    },
    create: async ({ data }: any) => {
      const r = { id: `route-${routes.length}`, detachedAt: null, createdAt: new Date(), lastMessageAt: new Date(), ...data };
      routes.push(r);
      return r;
    },
  },
  fleetAgentMessage: { findFirst: async () => null },
  fleetAgent: {
    findUnique: async ({ where }: any) => fleetAgents[where.id] ?? null,
    update: async ({ where, data }: any) => {
      Object.assign(fleetAgents[where.id], data);
      return fleetAgents[where.id];
    },
  },
  serviceBox: { count: async () => 0, findMany: async () => [] },
  user: { findUnique: async ({ where }: any) => ({ id: where.id }) },
};

// ── Host falso: createAgent nace running de inmediato; el snapshot devuelve un id ──
const createAgent = vi.fn();
const createTemplateSnapshot = vi.fn();
const deleteTemplateSnapshot = vi.fn();
const resumeSandbox = vi.fn();
const refreshAgentEnv = vi.fn();
const execCommand = vi.fn();
const writeFile = vi.fn();
let nextAgent = 0;
function hostCreatesRunning() {
  createAgent.mockImplementation(async (_ctx: unknown, params: any) => {
    const id = `agent-${++nextAgent}`;
    agents.push({
      id,
      sandboxId: `sb_${id}`,
      ownerId: "u1",
      template: params.template,
      embedToken: "agt_x",
      fleetAgentId: null,
      status: "running",
      lastMessageAt: new Date(),
    });
    return { agentId: id, sandboxId: `sb_${id}`, embedToken: "agt_x" };
  });
}
/** 404 DerivedTemplateNotProvisioned, tal como lo traduce sandboxOperations. */
const notProvisioned = () =>
  new Response(JSON.stringify({ error: "DerivedTemplateNotProvisioned" }), { status: 404 });

vi.mock("~/.server/db", () => ({ db }));
vi.mock("~/.server/core/sandboxOperations", () => ({
  createAgent: (...a: unknown[]) => createAgent(...a),
  createTemplateSnapshot: (...a: unknown[]) => createTemplateSnapshot(...a),
  getTemplateSnapshot: vi.fn(async () => { throw new Response("{}", { status: 404 }); }),
  deleteTemplateSnapshot: (...a: unknown[]) => deleteTemplateSnapshot(...a),
  resumeSandbox: (...a: unknown[]) => resumeSandbox(...a),
  refreshAgentEnv: (...a: unknown[]) => refreshAgentEnv(...a),
  execCommand: (...a: unknown[]) => execCommand(...a),
  writeFile: (...a: unknown[]) => writeFile(...a),
  suspendSandbox: vi.fn(async () => ({})),
  destroySandbox: vi.fn(async () => ({})),
  openAgentChunkStream: vi.fn(),
  readFile: vi.fn(),
  listSandboxes: vi.fn(async () => agents.filter((a) => a.status === "running").map((a) => ({ status: "running" }))),
}));
vi.mock("~/.server/storage", () => ({
  getPlatformDefaultClient: () => ({ getReadUrl: async () => null }),
  buildPublicAssetUrl: (k: string) => k,
}));
vi.mock("~/.server/core/sandboxReservations", () => ({
  getReservedCapacity: async () => ({ machines: 0, agents: 0 }),
}));
vi.mock("~/.server/core/fleetTokens", () => ({
  ensureWorkerTokens: async () => ({ message: "msg-tok", admin: "adm-tok" }),
  forgetWorkerTokens: () => {},
}));
vi.mock("~/.server/core/secretOperations", () => ({
  getSecretValue: async () => "oauth-secret",
}));
vi.mock("~/.server/core/sandboxSessions", () => ({
  attributeSandboxSession: async () => {},
}));

process.env.SANDBOX_HOST_URL = "http://host.test";
process.env.FLEET_ARTIFACT = "on";
vi.stubGlobal(
  "fetch",
  vi.fn(async () => new Response(JSON.stringify({ memUsedMb: 0, memMaxMb: 65536 }), { status: 200 }))
);

const { fleetArtifactHash, pickOrSpawn, buildSpawnEnv, spawnEnvHash } = await import(
  "~/.server/core/fleetAgentOperations"
);

const seed = (name: string, text: string) => ({ name, contentBase64: Buffer.from(text).toString("base64") });
const base = {
  id: "fa1",
  ownerId: "u1",
  name: "Prueba",
  token: "legacy",
  workerTemplate: "claude-worker",
  persona: { env: { SYSTEM_PROMPT: "Eres Nik", ANTHROPIC_MODEL: "claude-sonnet-5" }, seedFiles: [seed("faq.md", "hola")] },
  skills: [{ id: "s1", name: "cotizar", description: "", files: ["f1"], enabled: true }],
  oauthSecretName: null,
  engineSecretName: null,
  vmMemMb: 2048,
  maxVms: 5,
  maxWorkersPerVm: 4,
  idleSuspendMin: 2,
  metadata: null as any,
};
const CTX = { user: { id: "u1" }, scopes: ["READ", "WRITE", "DELETE"] } as any;

describe("fleetArtifactHash — sólo el DISCO entra al hash", () => {
  it("es estable para la misma entrada", () => {
    expect(fleetArtifactHash(base)).toBe(fleetArtifactHash({ ...base }));
    expect(fleetArtifactHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("cambia con los seeds (contenido y nombre)", () => {
    const h = fleetArtifactHash(base);
    expect(fleetArtifactHash({ ...base, persona: { ...base.persona, seedFiles: [seed("faq.md", "adiós")] } })).not.toBe(h);
    expect(fleetArtifactHash({ ...base, persona: { ...base.persona, seedFiles: [seed("otro.md", "hola")] } })).not.toBe(h);
  });
  it("cambia con el template y con el manifiesto de skills encendidos", () => {
    const h = fleetArtifactHash(base);
    expect(fleetArtifactHash({ ...base, workerTemplate: "codex-worker" })).not.toBe(h);
    expect(fleetArtifactHash({ ...base, skills: [{ ...base.skills[0], enabled: false }] })).not.toBe(h);
    expect(fleetArtifactHash({ ...base, skills: [{ ...base.skills[0], files: ["f1", "f2"] }] })).not.toBe(h);
  });
  it("NO cambia con prompt, modelo ni credenciales (eso va por env)", () => {
    const h = fleetArtifactHash(base);
    const env = { SYSTEM_PROMPT: "Otro prompt", ANTHROPIC_MODEL: "claude-opus-5", CLAUDE_CODE_OAUTH_TOKEN: "x" };
    expect(fleetArtifactHash({ ...base, persona: { ...base.persona, env } })).toBe(h);
    expect(fleetArtifactHash({ ...base, engineSecretName: "OTRA_KEY" } as any)).toBe(h);
  });
  it("el orden de seeds/skills no importa", () => {
    const a = { ...base, persona: { ...base.persona, seedFiles: [seed("a", "1"), seed("b", "2")] } };
    const b = { ...base, persona: { ...base.persona, seedFiles: [seed("b", "2"), seed("a", "1")] } };
    expect(fleetArtifactHash(a)).toBe(fleetArtifactHash(b));
  });
});

describe("spawnVm — decisión de nacer desde el artifact", () => {
  beforeEach(() => {
    agents = [];
    routes = [];
    nextAgent = 0;
    createAgent.mockReset();
    createTemplateSnapshot.mockReset();
    deleteTemplateSnapshot.mockReset();
    resumeSandbox.mockReset();
    refreshAgentEnv.mockReset();
    hostCreatesRunning();
    createTemplateSnapshot.mockResolvedValue({ derivedId: "dt_new", sizeBytes: 1, reused: false, templateVersion: "v1" });
    fleetAgents = { fa1: { ...base, metadata: null } };
  });

  it("sin artifact: spawn normal con seeds y captura el snapshot ANTES del turno", async () => {
    await pickOrSpawn(CTX, fleetAgents.fa1, "web-1");
    expect(createAgent).toHaveBeenCalledTimes(1);
    const params = createAgent.mock.calls[0][1];
    expect(params.derivedTemplate).toBeUndefined();
    expect(params.seedFiles).toEqual(base.persona.seedFiles);
    expect(createTemplateSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      "sb_agent-1",
      expect.objectContaining({ key: "fleet:fa1", hash: fleetArtifactHash(base) })
    );
    expect(fleetAgents.fa1.metadata.artifact).toMatchObject({ derivedId: "dt_new", hash: fleetArtifactHash(base) });
    // El env horneado queda sellado para comparar al despertar.
    expect(agents[0].spawnEnvHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("con artifact vigente: nace del derivado, sin seeds, sin recapturar", async () => {
    fleetAgents.fa1.metadata = { artifact: { derivedId: "dt_ok", hash: fleetArtifactHash(base), at: "x" } };
    await pickOrSpawn(CTX, fleetAgents.fa1, "web-1");
    const params = createAgent.mock.calls[0][1];
    expect(params.derivedTemplate).toBe("dt_ok");
    expect(params.seedFiles).toBeUndefined();
    expect(params.env.SYSTEM_PROMPT).toBe("Eres Nik"); // las open options siguen yendo por env
    expect(createTemplateSnapshot).not.toHaveBeenCalled();
  });

  it("cambió el hash (seeds nuevos): spawn normal, captura nuevo y borra el viejo", async () => {
    fleetAgents.fa1.metadata = { artifact: { derivedId: "dt_old", hash: "0".repeat(64), at: "x" } };
    await pickOrSpawn(CTX, fleetAgents.fa1, "web-1");
    expect(createAgent.mock.calls[0][1].derivedTemplate).toBeUndefined();
    expect(createTemplateSnapshot).toHaveBeenCalledTimes(1);
    expect(deleteTemplateSnapshot).toHaveBeenCalledWith(expect.anything(), "dt_old");
    expect(fleetAgents.fa1.metadata.artifact.derivedId).toBe("dt_new");
  });

  it("el host dice 404 NotProvisioned: descarta el artifact y cae al spawn normal", async () => {
    fleetAgents.fa1.metadata = { artifact: { derivedId: "dt_gone", hash: fleetArtifactHash(base), at: "x" } };
    createAgent.mockRejectedValueOnce(notProvisioned());
    await pickOrSpawn(CTX, fleetAgents.fa1, "web-1");
    expect(createAgent).toHaveBeenCalledTimes(2);
    expect(createAgent.mock.calls[0][1].derivedTemplate).toBe("dt_gone");
    expect(createAgent.mock.calls[1][1].derivedTemplate).toBeUndefined();
    expect(createAgent.mock.calls[1][1].seedFiles).toEqual(base.persona.seedFiles);
    // Se recaptura sobre la caja nueva.
    expect(fleetAgents.fa1.metadata.artifact.derivedId).toBe("dt_new");
  });

  it("el hijo del derivado NO arranca: descarta el artifact y reintenta con spawn normal", async () => {
    fleetAgents.fa1.metadata = { artifact: { derivedId: "dt_bad", hash: fleetArtifactHash(base), at: "x" } };
    // 1er create (derivado) nace en `error` (p.ej. dmsetup busy); el 2º (normal) running.
    createAgent.mockImplementationOnce(async (_ctx: unknown, params: any) => {
      const id = `agent-${++nextAgent}`;
      agents.push({ id, sandboxId: `sb_${id}`, ownerId: "u1", template: params.template, embedToken: "t", fleetAgentId: null, status: "error", lastMessageAt: new Date() });
      return { agentId: id, sandboxId: `sb_${id}`, embedToken: "t" };
    });
    const placed = await pickOrSpawn(CTX, fleetAgents.fa1, "web-1");
    expect(placed.vm.status).toBe("running");
    expect(createAgent).toHaveBeenCalledTimes(2);
    expect(createAgent.mock.calls[0][1].derivedTemplate).toBe("dt_bad");
    expect(createAgent.mock.calls[1][1].derivedTemplate).toBeUndefined();
    expect(agents.find((a) => a.id === "agent-1")!.status).toBe("lost");
    // Se re-capturó sobre la caja sana.
    expect(fleetAgents.fa1.metadata.artifact.derivedId).toBe("dt_new");
  });

  it("FLEET_ARTIFACT apagado: spawn normal siempre, sin captura ni derivado", async () => {
    process.env.FLEET_ARTIFACT = "off";
    try {
      fleetAgents.fa1.metadata = { artifact: { derivedId: "dt_ok", hash: fleetArtifactHash(base), at: "x" } };
      await pickOrSpawn(CTX, fleetAgents.fa1, "web-1");
      expect(createAgent.mock.calls[0][1].derivedTemplate).toBeUndefined();
      expect(createTemplateSnapshot).not.toHaveBeenCalled();
    } finally {
      process.env.FLEET_ARTIFACT = "on";
    }
  });

  it("otro error del host sube tal cual (no se traga)", async () => {
    fleetAgents.fa1.metadata = { artifact: { derivedId: "dt_ok", hash: fleetArtifactHash(base), at: "x" } };
    createAgent.mockRejectedValueOnce(new Error("host down"));
    await expect(pickOrSpawn(CTX, fleetAgents.fa1, "web-1")).rejects.toThrow("host down");
  });

  it("si la captura falla, el turno sale igual", async () => {
    createTemplateSnapshot.mockRejectedValue(new Error("501 DerivedTemplateUnsupported"));
    const placed = await pickOrSpawn(CTX, fleetAgents.fa1, "web-1");
    expect(placed.vm.status).toBe("running");
    expect(fleetAgents.fa1.metadata?.artifact).toBeUndefined();
  });
});

describe("ensureRunning — env por resume", () => {
  beforeEach(async () => {
    routes = [];
    createAgent.mockReset();
    resumeSandbox.mockReset();
    refreshAgentEnv.mockReset();
    resumeSandbox.mockResolvedValue({});
    refreshAgentEnv.mockResolvedValue({});
    fleetAgents = { fa1: { ...base, metadata: null } };
    const env = await buildSpawnEnv(CTX, fleetAgents.fa1);
    agents = [
      {
        id: "agent-s",
        sandboxId: "sb_s",
        ownerId: "u1",
        template: "claude-worker",
        embedToken: "agt_x",
        fleetAgentId: "fa1",
        status: "suspended",
        spawnEnvHash: spawnEnvHash(env),
        lastMessageAt: new Date(),
      },
    ];
    routes = [{ id: "r1", fleetAgentId: "fa1", groupId: "web-1", agentId: "agent-s", sessionUuid: "s1", createdAt: new Date(), lastMessageAt: new Date(), detachedAt: null }];
  });

  it("mismo env: resume caliente, sin reinicio", async () => {
    await pickOrSpawn(CTX, fleetAgents.fa1, "web-1");
    expect(resumeSandbox).toHaveBeenCalledWith(expect.anything(), "sb_s");
    expect(refreshAgentEnv).not.toHaveBeenCalled();
  });

  it("cambió ANTHROPIC_MODEL en persona.env: despierta con env nuevo y sella el hash", async () => {
    fleetAgents.fa1.persona = { ...base.persona, env: { ...base.persona.env, ANTHROPIC_MODEL: "claude-opus-5" } };
    await pickOrSpawn(CTX, fleetAgents.fa1, "web-1");
    expect(resumeSandbox).not.toHaveBeenCalled();
    expect(refreshAgentEnv).toHaveBeenCalledTimes(1);
    const [, agent, env] = refreshAgentEnv.mock.calls[0];
    expect(agent.sandboxId).toBe("sb_s");
    expect(env.ANTHROPIC_MODEL).toBe("claude-opus-5");
    expect(agents[0].spawnEnvHash).toBe(spawnEnvHash(env));
    // Un segundo despertar con el mismo env ya no reinicia.
    agents[0].status = "suspended";
    await pickOrSpawn(CTX, fleetAgents.fa1, "web-1");
    expect(refreshAgentEnv).toHaveBeenCalledTimes(1);
    expect(resumeSandbox).toHaveBeenCalledTimes(1);
  });

  it("si el refresh falla (env incompleto), cae al resume sin env y no sella el hash", async () => {
    fleetAgents.fa1.persona = { ...base.persona, env: { ...base.persona.env, SYSTEM_PROMPT: "Nuevo" } };
    const before = agents[0].spawnEnvHash;
    refreshAgentEnv.mockRejectedValueOnce(new Response("{}", { status: 400 }));
    const placed = await pickOrSpawn(CTX, fleetAgents.fa1, "web-1");
    expect(placed.vm.status).toBe("running");
    expect(resumeSandbox).toHaveBeenCalledWith(expect.anything(), "sb_s");
    expect(agents[0].spawnEnvHash).toBe(before);
  });
});

describe("reserveVm — techo de cuenta: adoptar caja dormida hermana", () => {
  beforeEach(() => {
    agents = [];
    routes = [];
    nextAgent = 0;
    createAgent.mockReset();
    resumeSandbox.mockReset();
    refreshAgentEnv.mockReset();
    execCommand.mockReset();
    writeFile.mockReset();
    resumeSandbox.mockResolvedValue({});
    refreshAgentEnv.mockResolvedValue({});
    execCommand.mockResolvedValue({});
    writeFile.mockResolvedValue({});
    hostCreatesRunning();
    createTemplateSnapshot.mockResolvedValue({ derivedId: "dt_new", sizeBytes: 1 });
    fleetAgents = { fa1: { ...base, metadata: null }, fa2: { ...base, id: "fa2", metadata: null } };
  });

  it("mismo template: adopta la VM dormida de fa2 y la despierta con el env de fa1", async () => {
    // Sin roles el plan es Byte = 1 caja: la suspendida de fa2 llena la cuenta.
    agents.push({ id: "nap", sandboxId: "sb_nap", ownerId: "u1", template: "claude-worker", embedToken: "t", fleetAgentId: "fa2", status: "suspended", spawnEnvHash: "old", lastMessageAt: new Date(0) });
    routes.push({ id: "r-fa2", fleetAgentId: "fa2", groupId: "g2", agentId: "nap", sessionUuid: "s2", createdAt: new Date(), lastMessageAt: new Date(), detachedAt: null });

    const placed = await pickOrSpawn(CTX, fleetAgents.fa1, "web-1");
    expect(createAgent).not.toHaveBeenCalled();
    expect(placed.vm.id).toBe("nap");
    expect(agents.find((a) => a.id === "nap")!.fleetAgentId).toBe("fa1");
    // La ruta de fa2 quedó desatada; su memoria vive en el respaldo.
    expect(routes.find((r) => r.id === "r-fa2")!.agentId).toBeNull();
    // Despertó con el env de fa1 (hash cambió) y se resembró.
    expect(refreshAgentEnv).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenCalledWith(expect.anything(), "sb_nap", expect.objectContaining({ command: expect.stringContaining("rm -rf /data/workspaces") }));
    expect(writeFile).toHaveBeenCalledWith(expect.anything(), "sb_nap", expect.objectContaining({ path: "/data/workspace/faq.md" }));
  });

  it("distinto template: no adopta (cae al camino de destruir + spawn)", async () => {
    agents.push({ id: "nap", sandboxId: "sb_nap", ownerId: "u1", template: "codex-worker", embedToken: "t", fleetAgentId: "fa2", status: "suspended", lastMessageAt: new Date(0) });
    await pickOrSpawn(CTX, fleetAgents.fa1, "web-1");
    // reclaimAccountCapacity destruyó la ajena y se spawneó una propia.
    expect(createAgent).toHaveBeenCalledTimes(1);
    expect(agents.find((a) => a.id === "nap")).toBeUndefined();
  });
});
