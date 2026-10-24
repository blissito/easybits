import { describe, it, expect } from "vitest";
import { cleanToolRules, decideTool, ruleMatches } from "~/lib/toolPolicy";
import { approvalSummary, inputHash, verifyDecisionSig } from "~/.server/core/fleetApprovals";
import { resolveToolRules } from "~/.server/core/fleetAgentOperations";
import { createHmac } from "node:crypto";

// Reglas por herramienta de la flota: permitir, preguntar o negar (misma semántica que Claude Code).
describe("reglas por herramienta", () => {
  it("comodín y sin mayúsculas", () => {
    expect(ruleMatches("mcp__easybits__*_delete", "mcp__easybits__file_delete")).toBe(true);
    expect(ruleMatches("mcp__denik__*", "mcp__denik__create_booking")).toBe(true);
    expect(ruleMatches("bash", "Bash")).toBe(true);
    expect(ruleMatches("mcp__denik__*", "mcp__denikx__a")).toBe(false);
    expect(ruleMatches("a.b", "aXb")).toBe(false);
  });
  it("negar gana a preguntar y preguntar a permitir; sin reglas todo pasa", () => {
    const rules = [
      { pattern: "mcp__denik__*", action: "allow" as const },
      { pattern: "mcp__denik__create_*", action: "ask" as const },
      { pattern: "mcp__denik__create_refund", action: "deny" as const },
    ];
    expect(decideTool(rules, "mcp__denik__list_services")).toBe("allow");
    expect(decideTool(rules, "mcp__denik__create_booking")).toBe("ask");
    expect(decideTool(rules, "mcp__denik__create_refund")).toBe("deny");
    expect(decideTool(rules, "Bash")).toBe("allow");
    expect(decideTool([], "Bash")).toBe("allow");
  });
  it("se sanean forma, acción y caracteres", () => {
    expect(cleanToolRules([{ pattern: " Bash ", action: "ask" }, { pattern: "x(y)", action: "deny" }, { pattern: "a", action: "maybe" }, "no"])).toEqual([{ pattern: "Bash", action: "ask" }]);
  });
  it("el canal hereda del default `*` y su propia lista gana", () => {
    const agent = { groupConfigs: { "*": { toolRules: [{ pattern: "Bash", action: "deny" }] }, "waba:1": { toolRules: [{ pattern: "Bash", action: "ask" }] } } };
    expect(resolveToolRules(agent, "otro")).toEqual([{ pattern: "Bash", action: "deny" }]);
    expect(resolveToolRules(agent, "waba:1")).toEqual([{ pattern: "Bash", action: "ask" }]);
  });
});

describe("aprobaciones", () => {
  it("la huella es la misma aunque cambie el orden de los argumentos", () => {
    expect(inputHash("t", { a: 1, b: { c: 2, d: 3 } })).toBe(inputHash("t", { b: { d: 3, c: 2 }, a: 1 }));
    expect(inputHash("t", { a: 1 })).not.toBe(inputHash("t", { a: 2 }));
    expect(inputHash("t", { a: 1 })).not.toBe(inputHash("u", { a: 1 }));
  });
  it("el resumen sale de los datos y tapa credenciales", () => {
    const s = approvalSummary("mcp__denik__create_booking", { service: "Corte", date: "2026-10-25" });
    expect(s).toBe('denik · create_booking — {"date":"2026-10-25","service":"Corte"}');
    expect(approvalSummary("Bash", { command: "curl -H 'Authorization: Bearer eb_sk_abcdefghijk' x" })).not.toMatch(/abcdefghijk/);
  });
  it("la liga firmada sólo vale para su aprobación y su decisión", () => {
    const secret = process.env.APPROVAL_SECRET || process.env.SECRET || "dev";
    const sig = createHmac("sha256", secret).update("abc:approve").digest("base64url");
    expect(verifyDecisionSig("abc", "approve", sig)).toBe(true);
    expect(verifyDecisionSig("abc", "deny", sig)).toBe(false);
    expect(verifyDecisionSig("abd", "approve", sig)).toBe(false);
  });
});

describe("tarjeta de aprobación en el chat de Sitios", () => {
  it("el evento approval agrega la tarjeta una sola vez", async () => {
    const { applyTurnEvent } = await import("~/components/sitios/ChatMessages");
    const a = { id: "x1", tool: "Bash", summary: "Bash — rm -rf dist", expiresAt: "2026-10-25T00:00:00Z" };
    let m = applyTurnEvent({ role: "bot", text: "" }, { type: "approval", approval: a }).msg;
    m = applyTurnEvent(m, { type: "approval", approval: a }).msg;
    expect(m.approvals).toEqual([{ ...a, status: "awaiting" }]);
    m = applyTurnEvent(m, { type: "snapshot", text: "hola", tools: [], cortes: [], steps: [] }).msg;
    expect(m.approvals).toHaveLength(1);
  });
});
