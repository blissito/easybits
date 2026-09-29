import { describe, it, expect, vi, beforeEach } from "vitest";

// Un arranque fallido (sandbox-host rechaza agent/start) NO puede terminar en running:
// antes el error se quedaba en el log, la fila en "error" sin razón, y el siguiente GET la
// "curaba" a running porque la VM respondía — con la unit muerta.

const updates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
const db = {
  agent: {
    update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      updates.push(args);
      return { id: args.where.id, ...args.data };
    }),
  },
};
vi.mock("~/.server/db", () => ({ db }));
vi.mock("~/.server/crypto", () => ({
  encryptSecret: (s: string) => s,
  decryptSecret: (s: string) => s,
}));

const startAgent = vi.fn();
const runAcpHandshake = vi.fn();
vi.mock("~/.server/core/sandboxOperations", async (importOriginal) => {
  const real = await importOriginal<typeof import("~/.server/core/sandboxOperations")>();
  return {
    ...real,
    ownedAgentRow: vi.fn(async () => ({
      id: "a1",
      ownerId: "u1",
      sandboxId: "sb_1",
      template: "ghosty-lite",
      port: 3000,
      messagePath: "/acp",
      spawnEnv: JSON.stringify({ ACP_AGENT_TOKEN: "t" }),
      acpMcpServers: null,
    })),
    resolveTemplate: vi.fn(async () => ({ agent: { port: 3000, unit: "u" } })),
    resumeSandbox: vi.fn(async () => ({})),
    startAgent,
    runAcpHandshake,
    expandAcpMcpSecrets: vi.fn(async () => []),
  };
});

const { reconcileAgentStatus, startErrorMessage } = await import("~/.server/core/sandboxOperations");
const { restartAgentMachine, machineErrorResponse } = await import("~/.server/core/agentMachineOperations");

const ctx = { user: { id: "u1" }, scopes: ["WRITE"] } as never;

beforeEach(() => {
  updates.length = 0;
  startAgent.mockReset();
  runAcpHandshake.mockReset();
});

describe("reconcileAgentStatus", () => {
  it("un arranque fallido no se cura porque la VM responde", () => {
    expect(reconcileAgentStatus({ status: "error", lastError: "env value contains newline" }, "running")).toBeNull();
  });
  it("pero una caja que ya no existe sí gana: lost", () => {
    expect(reconcileAgentStatus({ status: "error", lastError: "x" }, "lost")).toBe("lost");
  });
  it("sin razón registrada se conserva la reconciliación de siempre", () => {
    expect(reconcileAgentStatus({ status: "error" }, "running")).toBe("running");
    expect(reconcileAgentStatus({ status: "building" }, "running")).toBe("running");
    expect(reconcileAgentStatus({ status: "running" }, "lost")).toBe("lost");
    expect(reconcileAgentStatus({ status: "running" }, "running")).toBeNull();
    expect(reconcileAgentStatus({ status: "running" }, null)).toBeNull();
  });
});

describe("startErrorMessage", () => {
  it("aplana y acota el mensaje", () => {
    expect(startErrorMessage(new Error("a\n  b"))).toBe("a b");
    expect(startErrorMessage("x".repeat(900)).length).toBe(500);
  });
});

describe("restartAgentMachine", () => {
  it("si el host rechaza el arranque: status error con razón y 502 legible", async () => {
    startAgent.mockRejectedValueOnce(new Error("sandbox-host 400: env value for SYSTEM_PROMPT contains newline"));
    const err = await restartAgentMachine(ctx, "a1").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(updates).toHaveLength(1);
    expect(updates[0].data.status).toBe("error");
    expect(updates[0].data.lastError).toMatch(/contains newline/);
    const res = machineErrorResponse(err);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toMatch(/^agent failed to start: .*contains newline/);
  });

  it("un arranque bueno sigue marcando running y limpia la razón", async () => {
    startAgent.mockResolvedValueOnce({ agentUrl: "x" });
    runAcpHandshake.mockResolvedValueOnce({ acpSessionId: "s", acpTransportSessionId: "t" });
    await expect(restartAgentMachine(ctx, "a1")).resolves.toEqual({ reiniciado: true, sandboxId: "sb_1" });
    expect(updates).toHaveLength(1);
    expect(updates[0].data).toMatchObject({ status: "running", lastError: null, acpSessionId: "s" });
  });
});
