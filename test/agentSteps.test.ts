import { describe, it, expect } from "vitest";
import { stepKind, upsertStep, type AgentStep, publicStep, lastIntent } from "~/lib/agentSteps";
import { applyTurnEvent, type Msg } from "~/components/sitios/ChatMessages";
import { ok } from "~/.server/mcp/responses";

// «La computadora del agente»: los pasos que pinta el panel salen de los eventos del turno.
describe("pasos del panel", () => {
  it("clasifica la herramienta por su nombre", () => {
    expect(stepKind("mcp__render__browser_act")).toBe("browser");
    expect(stepKind("Bash")).toBe("terminal");
    expect(stepKind("Write")).toBe("editor");
    expect(stepKind("WebSearch")).toBe("search");
  });

  it("start → frame → end se juntan en un paso por id, sin perder la captura", () => {
    let s: AgentStep[] = [];
    s = upsertStep(s, { id: "t1", tool: "mcp__render__browser_act", kind: "browser", status: "running", startedAt: 1 });
    s = upsertStep(s, { id: "t1", browser: { url: "https://x.mx", title: "X", image: "https://cdn/x.jpg" } });
    s = upsertStep(s, { id: "t1", status: "ok", endedAt: 2 });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ status: "ok", browser: { url: "https://x.mx" }, endedAt: 2 });
  });

  it("el chat aplica `step` y el `snapshot` trae los pasos al re-engancharse", () => {
    const base: Msg = { role: "bot", text: "" };
    const a = applyTurnEvent(base, { type: "step", step: { id: "t1", tool: "Bash", kind: "terminal", status: "running", startedAt: 1 } }).msg;
    expect(a.steps).toHaveLength(1);
    const b = applyTurnEvent(a, { type: "snapshot", text: "hola", tools: [], cortes: [], steps: [] }).msg;
    expect(b.steps).toEqual([]);
  });
});

describe("ok() del MCP", () => {
  it("null o arreglo no van como structuredContent (el SDK exige objeto)", () => {
    expect(ok(null)).not.toHaveProperty("structuredContent");
    expect(ok([1, 2])).not.toHaveProperty("structuredContent");
    expect(ok({ a: 1 }).structuredContent).toEqual({ a: 1 });
  });
});

describe("publicStep (replay público)", () => {
  it("quita comando, sessionId y la query de la URL", () => {
    const s = publicStep({
      id: "1",
      tool: "mcp__render__browser_open",
      kind: "browser",
      detail: "https://x.com/a?token=secreto",
      command: 'curl -H "Authorization: Bearer eb_sk_123"',
      status: "ok",
      startedAt: 0,
      browser: { url: "https://x.com/a?token=secreto#k", title: "X", image: "i.jpg", sessionId: "s1" },
    });
    expect(JSON.stringify(s)).not.toMatch(/secreto|eb_sk_|s1/);
    expect(s.browser?.url).toBe("https://x.com/a");
  });
  it("deja sólo el nombre del archivo en el editor", () => {
    expect(publicStep({ id: "2", tool: "Write", kind: "editor", detail: "/data/app/src/db.ts", status: "ok", startedAt: 0 }).detail).toBe("db.ts");
  });
});

describe("lastIntent", () => {
  it("toma la última frase de la narración antes de la herramienta", () => {
    expect(lastIntent("Listo el esquema. Ahora pruebo que /admin pida login.\n")).toBe("Ahora pruebo que /admin pida login.");
    expect(lastIntent("   ")).toBeUndefined();
    expect(lastIntent("…")).toBeUndefined();
  });
});
