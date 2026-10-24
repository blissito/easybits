import { describe, it, expect } from "vitest";
import { stepKind, upsertStep, type AgentStep, publicStep, lastIntent, cleanStepResult, cleanTodos, currentPlan, stepsSignature, turnSummary, formatWorked, normalizeStepResult, isPlumbing } from "~/lib/agentSteps";
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

describe("resultado del paso", () => {
  it("el cierre trae el resultado y un frame posterior no lo borra", () => {
    let s: AgentStep[] = [];
    s = upsertStep(s, { id: "t1", tool: "Bash", kind: "terminal", status: "running", startedAt: 1 });
    s = upsertStep(s, { id: "t1", status: "ok", endedAt: 2, result: { summary: "listo", exitCode: 0 } });
    s = upsertStep(s, { id: "t1", endedAt: 3 });
    expect(s[0].result).toEqual({ summary: "listo", exitCode: 0 });
  });

  it("el servidor no le cree el tamaño ni la forma al worker", () => {
    const r = cleanStepResult({
      summary: "x".repeat(10_000),
      exitCode: "0",
      items: [{ title: "ok", url: "https://a.mx" }, { title: "malo", url: "javascript:alert(1)" }, ...Array(20).fill({ title: "t", path: "a.ts" })],
      diff: { removed: Array(100).fill("y".repeat(500)), added: "no-arreglo" },
    })!;
    expect(r.summary!.length).toBeLessThanOrEqual(2000);
    expect(r.exitCode).toBeUndefined();
    expect(r.items!.length).toBeLessThanOrEqual(10);
    expect(r.items!.some((i) => i.url?.startsWith("javascript"))).toBe(false);
    expect(r.diff!.removed.length).toBeLessThanOrEqual(41);
    expect(r.diff!.removed[0].length).toBeLessThanOrEqual(200);
    expect(cleanStepResult("texto")).toBeUndefined();
  });

  it("el replay público sólo conserva los enlaces de una búsqueda, sin query", () => {
    const s = publicStep({
      id: "3",
      tool: "Bash",
      kind: "terminal",
      status: "ok",
      startedAt: 0,
      result: { summary: "DATABASE_URL=mongodb://u:p@h", exitCode: 0, diff: { removed: ["a"], added: ["b"] }, items: [{ title: "A", url: "https://a.mx/x?k=1" }, { title: "f", path: "/data/secreto.ts" }] },
    });
    expect(s.result).toEqual({ items: [{ title: "A", url: "https://a.mx/x" }] });
    expect(publicStep({ id: "4", tool: "Bash", kind: "terminal", status: "ok", startedAt: 0, result: { summary: "x" } }).result).toBeUndefined();
  });

  it("el plan vigente es el último que escribió el agente", () => {
    const steps: AgentStep[] = [
      { id: "a", tool: "TodoWrite", kind: "other", status: "ok", startedAt: 0, todos: [{ content: "uno", status: "in_progress" }] },
      { id: "b", tool: "Bash", kind: "terminal", status: "ok", startedAt: 1 },
      { id: "c", tool: "TodoWrite", kind: "other", status: "ok", startedAt: 2, todos: [{ content: "uno", status: "completed" }] },
    ];
    expect(currentPlan(steps)?.[0].status).toBe("completed");
    expect(currentPlan(steps, 1)?.[0].status).toBe("in_progress");
    expect(stepKind("TodoWrite")).toBe("other");
    expect(cleanTodos([{ content: "x", status: "raro" }, { nada: 1 }])).toEqual([{ content: "x", status: "pending" }]);
  });

  it("la firma cambia cuando un paso sólo gana captura o resultado", () => {
    const base: AgentStep[] = [{ id: "a", tool: "Bash", kind: "terminal", status: "running", startedAt: 0 }];
    const a = stepsSignature(base);
    expect(stepsSignature(upsertStep(base, { id: "a", result: { summary: "x" } }))).not.toBe(a);
    expect(stepsSignature(upsertStep(base, { id: "a", browser: { url: "u", title: "t", image: "i" } }))).not.toBe(a);
  });
});

describe("cierre del turno", () => {
  const st = (id: string, t: number, image?: string): AgentStep => ({ id, tool: image ? "mcp__render__browser_act" : "Bash", kind: image ? "browser" : "terminal", status: "ok", startedAt: t, endedAt: t + 1000, ...(image ? { browser: { url: "u", title: id, image } } : {}) });
  it("cuenta pasos sin el plan, mide el tiempo y reparte capturas distintas", () => {
    const steps = [
      { id: "p", tool: "TodoWrite", kind: "other" as const, status: "ok" as const, startedAt: 0 },
      st("a", 0, "1.jpg"), st("b", 10_000, "1.jpg"), st("c", 20_000, "2.jpg"), st("d", 30_000), ...Array.from({ length: 8 }, (_, i) => st(`x${i}`, 40_000 + i * 1000, `${i + 3}.jpg`)),
    ];
    const r = turnSummary(steps)!;
    expect(r.count).toBe(12);
    expect(r.ms).toBe(48_000);
    expect(r.thumbs).toHaveLength(6);
    expect(new Set(r.thumbs.map((t) => t.image)).size).toBe(6);
    expect(r.thumbs[0].id).toBe("a");
    expect(r.thumbs[5].image).toBe("10.jpg");
    expect(turnSummary([])).toBeNull();
    expect(formatWorked(48_000)).toBe("48 s");
    expect(formatWorked(185_000)).toBe("3 min");
  });
});

describe("presentación del resultado", () => {
  it("sandbox_exec ({exitCode, stdout, stderr}) se lee como terminal", () => {
    expect(normalizeStepResult({ summary: '{"exitCode":2,"stdout":"a\\nb","stderr":"err"}' })).toEqual({ summary: "a\nb\nerr", exitCode: 2 });
    expect(normalizeStepResult({ summary: '{"ok":true}' })).toEqual({ summary: '{"ok":true}' });
    expect(normalizeStepResult({ summary: "texto" })).toEqual({ summary: "texto" });
  });
  it("el plan y ToolSearch son trámite, no pasos", () => {
    for (const t of ["TodoWrite", "TaskCreate", "TaskUpdate", "ToolSearch", "mcp__easybits__discover_tools"]) expect(isPlumbing(t)).toBe(true);
    for (const t of ["Bash", "WebSearch", "mcp__easybits__sandbox_exec"]) expect(isPlumbing(t)).toBe(false);
  });
});

describe("búsqueda impresa como JSON", () => {
  it("un string entre comillas con \\n literales se lee como lista de resultados", () => {
    const summary = JSON.stringify("# Tacos Cholula Puebla\n\n- [Cholula - Wikipedia](https://es.wikipedia.org/wiki/Cholula) — ciudad\n- [Cholula, Puebla](https://www.gob.mx/sectur) — x").slice(0, 150);
    const r = normalizeStepResult({ summary }, "search")!;
    expect(r.items).toEqual([
      { title: "Cholula - Wikipedia", url: "https://es.wikipedia.org/wiki/Cholula" },
      { title: "Cholula, Puebla", url: "https://www.gob.mx/sectur" },
    ]);
    expect(r.summary).toBeUndefined();
    expect(normalizeStepResult({ summary: '"hola\\nmundo"' })?.summary).toBe("hola\nmundo");
  });
});
