import { describe, it, expect } from "vitest";
import { resolveGroupMcpServers } from "~/.server/core/fleetAgentOperations";

// El drawer de perfil guarda los conectores ON del agente bajo la clave reservada
// groupConfigs["*"]. Un grupo SIN config propia hereda ese default; un grupo CON
// `mcpServers` explícito (override de la modal Capacidades) GANA, aunque sea [].
// Usamos un MCP custom SIN secrets ($secret) → resuelve sin tocar el vault/DB.
const fleetAgent = {
  mcpCatalog: [
    { name: "testmcp", label: "Test", transport: "stdio", command: "echo", args: ["hi"], env: { FOO: "bar" } },
  ],
  groupConfigs: {
    "*": { mcpServers: ["testmcp"] }, // default del agente
    "group-override-off": { mcpServers: [] }, // override explícito: nada
  },
};

describe("resolveGroupMcpServers — default del agente (clave '*')", () => {
  it("un grupo sin config hereda el default '*'", async () => {
    const out = await resolveGroupMcpServers(fleetAgent, "group-sin-config", "owner1");
    expect(out).toBeDefined();
    expect(out!.testmcp).toMatchObject({ type: "stdio", command: "echo" });
  });

  it("un override explícito (aunque sea []) GANA sobre el default", async () => {
    const out = await resolveGroupMcpServers(fleetAgent, "group-override-off", "owner1");
    expect(out).toBeUndefined();
  });

  it("sin default ni override → undefined", async () => {
    const out = await resolveGroupMcpServers({ mcpCatalog: fleetAgent.mcpCatalog, groupConfigs: {} }, "g", "owner1");
    expect(out).toBeUndefined();
  });
});
