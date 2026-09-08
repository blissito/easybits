import { describe, it, expect, vi } from "vitest";

// La config de un canal HEREDA la del agente (clave reservada "*") campo a campo:
// si el canal no tiene la clave usa la del agente, y en cuanto la tiene GANA entera
// (no hay merge — apagar todo con [] es un override legítimo).
//
// Estos tests existen por un bug REAL de producción: los handlers mutaban partiendo
// del valor propio del canal, así que tocar UNA cosa en un canal que heredaba cinco
// lo dejaba con una y borraba las otras cuatro en silencio. Cinco canales acabaron
// con la lista vacía. Lo que sigue es la prueba que lo habría atrapado.

vi.mock("~/.server/db", () => ({
  db: { fleetAgent: { update: vi.fn(async () => ({})) } },
}));

import { applyCapabilityAction } from "~/.server/core/fleetCapabilityActions";
import { db } from "~/.server/db";

// Agente con CINCO conectores por default y un canal que los HEREDA (sin clave propia).
const agent = () =>
  ({
    id: "fa1",
    ownerId: "owner1",
    mcpCatalog: ["uno", "dos", "tres", "cuatro", "cinco"].map((name) => ({
      name, label: name, transport: "stdio", command: "echo", args: ["hi"],
    })),
    groupConfigs: {
      "*": {
        mcpServers: ["uno", "dos", "tres", "cuatro", "cinco"],
        capLevels: { uno: "read" },
        assets: ["file-a", "file-b"],
        toolDeny: ["tool-x"],
      },
      canal: {}, // hereda TODO
    },
  }) as any;

// Lo que el handler acabó guardando para el canal.
const saved = () => (db.fleetAgent.update as any).mock.calls.at(-1)[0].data.groupConfigs.canal;

describe("herencia canal↔agente: tocar un campo no borra lo heredado", () => {
  it("set-cap-level conserva los otros conectores heredados", async () => {
    (db.fleetAgent.update as any).mockClear();
    await applyCapabilityAction(agent(), { action: "set-cap-level", groupId: "canal", cap: "dos", level: "write" });
    // Antes del fix esto era ["dos"]: los otros cuatro desaparecían.
    expect(saved().mcpServers.sort()).toEqual(["cinco", "cuatro", "dos", "tres", "uno"]);
    expect(saved().capLevels).toMatchObject({ uno: "read", dos: "write" });
  });

  it("apagar una capacidad deja las demás", async () => {
    (db.fleetAgent.update as any).mockClear();
    await applyCapabilityAction(agent(), { action: "set-cap-level", groupId: "canal", cap: "dos", level: "off" });
    expect(saved().mcpServers.sort()).toEqual(["cinco", "cuatro", "tres", "uno"]);
  });

  it("toggle-asset conserva los archivos heredados", async () => {
    (db.fleetAgent.update as any).mockClear();
    await applyCapabilityAction(agent(), { action: "toggle-asset", groupId: "canal", fileId: "file-c", on: true });
    expect(saved().assets.sort()).toEqual(["file-a", "file-b", "file-c"]);
  });

  it("destildar un archivo heredado sólo quita ese", async () => {
    (db.fleetAgent.update as any).mockClear();
    await applyCapabilityAction(agent(), { action: "toggle-asset", groupId: "canal", fileId: "file-a", on: false });
    expect(saved().assets).toEqual(["file-b"]);
  });

  it("set-tool-deny conserva el deny heredado", async () => {
    (db.fleetAgent.update as any).mockClear();
    await applyCapabilityAction(agent(), { action: "set-tool-deny", groupId: "canal", tool: "tool-y", on: false });
    expect(saved().toolDeny.sort()).toEqual(["tool-x", "tool-y"]);
  });

  it("un canal con lista PROPIA no hereda (el override sigue mandando)", async () => {
    (db.fleetAgent.update as any).mockClear();
    const a = agent();
    a.groupConfigs.canal = { mcpServers: ["uno"] };
    await applyCapabilityAction(a, { action: "set-cap-level", groupId: "canal", cap: "dos", level: "read" });
    expect(saved().mcpServers.sort()).toEqual(["dos", "uno"]);
  });
});
