import { describe, it, expect } from "vitest";
import {
  parseAgentSpec,
  planAgentSpec,
  placeholderNames,
  sha256,
  specToYaml,
  stateToSpec,
  type AgentState,
} from "~/.server/core/agentSpec";

const b64 = (s: string) => Buffer.from(s).toString("base64");
const SKILL = "---\nname: pdf\ndescription: hace pdfs\n---\nUsa render.";

const state = (): AgentState => ({
  id: "6650f0c2a1b2c3d4e5f60718",
  name: "helper",
  template: "ghosty-lite",
  machine: true,
  prompt: { text: "Eres Helper.\n", mode: "append" },
  env: { ANTHROPIC_API_KEY: "sk-real", TZ: "America/Mexico_City", ACP_AGENT_TOKEN: "tok", SYSTEM_PROMPT: "Eres Helper.\n" },
  mcp: [{ type: "http", name: "crm", url: "https://crm.example.com/mcp", headers: [{ name: "Authorization", value: "Bearer real" }] }],
  skills: { pdf: { "SKILL.md": sha256(b64(SKILL)) } },
  files: { "catalogo.csv": sha256(b64("a,b\n")) },
});

const roundTrip = (st: AgentState) => parseAgentSpec(specToYaml(stateToSpec(st)));

describe("export", () => {
  it("nunca saca un secreto ni lo de la plataforma", () => {
    const y = specToYaml(stateToSpec(state()));
    expect(y).not.toContain("sk-real");
    expect(y).not.toContain("Bearer real");
    expect(y).not.toContain("ACP_AGENT_TOKEN");
    expect(y).toContain("${ANTHROPIC_API_KEY}");
    expect(y).toContain("${CRM_AUTHORIZATION}");
    expect(y).toContain("TZ: America/Mexico_City");
  });
  it("una URL con credenciales también se tapa; $secret: viaja tal cual", () => {
    const st = state();
    st.env = { DATABASE_URL: "postgres://u:p@h/db", CRM: "$secret:CRM_TOKEN" };
    const spec = stateToSpec(st);
    expect(spec.env).toEqual({ DATABASE_URL: "${DATABASE_URL}", CRM: "$secret:CRM_TOKEN" });
  });
  it("exportar y aplicar sin tocar = sin cambios", () => {
    const plan = planAgentSpec(state(), roundTrip(state()), {
      uploads: { skills: { pdf: [{ path: "SKILL.md", contentBase64: b64(SKILL) }] }, files: { "catalogo.csv": b64("a,b\n") } },
    });
    expect(plan.changes).toEqual([]);
    expect(plan.actions).toEqual([]);
  });
});

describe("plan", () => {
  it("prompt y modo", () => {
    const spec = roundTrip(state());
    spec.prompt = "Eres Helper, formal.\n";
    spec.promptMode = "replace";
    const p = planAgentSpec(state(), spec);
    expect(p.changes).toHaveLength(1);
    expect(p.actions).toEqual([{ kind: "prompt", text: "Eres Helper, formal.\n", mode: "replace" }]);
  });

  it("un ${X} sin valor conserva el de hoy; con valor lo cambia y reinicia", () => {
    const spec = roundTrip(state());
    expect(planAgentSpec(state(), spec).actions).toEqual([]);
    const p = planAgentSpec(state(), spec, { secrets: { ANTHROPIC_API_KEY: "sk-new" } });
    expect(p.changes.map((c) => c.what)).toEqual(["env: ~ANTHROPIC_API_KEY"]);
    const env = (p.actions[0] as { env: Record<string, string> }).env;
    expect(env.ANTHROPIC_API_KEY).toBe("sk-new");
    expect(p.actions.at(-1)).toEqual({ kind: "restart" });
  });

  it("quitar exige prune", () => {
    const spec = roundTrip(state());
    spec.env = {};
    spec.mcp = [];
    spec.skills = [];
    spec.files = [];
    const soft = planAgentSpec(state(), spec);
    expect(soft.actions).toEqual([]);
    expect(soft.changes.every((c) => c.op === "!")).toBe(true);
    const hard = planAgentSpec(state(), spec, { prune: true });
    expect(hard.changes.map((c) => c.op).sort()).toEqual(["-", "-", "-", "~"]);
    expect(hard.actions.map((a) => a.kind)).toEqual(["env", "mcp", "skill-rm", "file-rm", "restart"]);
    // lo de la plataforma sobrevive al prune
    expect((hard.actions[0] as { env: Record<string, string> }).env).toEqual({ ACP_AGENT_TOKEN: "tok", SYSTEM_PROMPT: "Eres Helper.\n" });
  });

  it("skill o archivo nuevos con carpeta; sin carpeta es !", () => {
    const spec = roundTrip(state());
    spec.skills = ["pdf", "cotizar"];
    const noDir = planAgentSpec(state(), spec);
    expect(noDir.changes).toEqual([{ op: "!", what: expect.stringContaining("skill cotizar") }]);
    const md = "---\nname: cotizar\ndescription: cotiza\n---\n";
    const p = planAgentSpec(state(), spec, { uploads: { skills: { cotizar: [{ path: "SKILL.md", contentBase64: b64(md) }] }, files: { "nuevo.md": b64("x") } } });
    expect(p.changes.map((c) => `${c.op} ${c.what}`)).toEqual(["+ skill cotizar (1 file(s))", "+ file nuevo.md"]);
    expect(p.actions.map((a) => a.kind)).toEqual(["skill-put", "file-put", "restart"]);
  });

  it("MCP: servidor nuevo sin su secreto no se aplica", () => {
    const spec = roundTrip(state());
    spec.mcp!.push({ name: "erp", type: "http", url: "https://erp/mcp", headers: { Authorization: "${ERP_TOKEN}" } });
    const p = planAgentSpec(state(), spec);
    expect(p.actions).toEqual([]);
    expect(p.changes.some((c) => c.op === "!" && c.what.includes("ERP_TOKEN"))).toBe(true);
    const ok = planAgentSpec(state(), spec, { secrets: { ERP_TOKEN: "Bearer x" } });
    expect(ok.changes).toEqual([{ op: "+", what: "mcp erp" }]);
    expect(ok.actions.map((a) => a.kind)).toEqual(["mcp", "restart"]);
  });

  it("template distinto y agente sin máquina", () => {
    const spec = roundTrip(state());
    spec.template = "goose";
    expect(planAgentSpec(state(), spec).changes[0].op).toBe("!");
    const bare: AgentState = { id: "x", name: "a", template: "chat-anthropic", machine: false };
    const p = planAgentSpec(bare, { kind: "easybits-agent", version: 1, name: "b", prompt: "hola" });
    expect(p.actions).toEqual([{ kind: "name", name: "b" }]);
    expect(p.changes[1].op).toBe("!");
  });

  it("valida el archivo y encuentra los ${X}", () => {
    expect(() => parseAgentSpec("kind: otro")).toThrow(/kind/);
    expect(() => parseAgentSpec("mcp:\n  - name: x")).toThrow(/url/);
    expect(placeholderNames("a: ${A}\nb: Bearer ${B} ${A}")).toEqual(["A", "B"]);
  });
});
