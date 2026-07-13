import { describe, it, expect, beforeEach, vi } from "vitest";
import { EasybitsClient } from "../packages/sdk/src/index";

// Congela el CONTRATO de eb.fleet.* — el seam del que depende Formmy. Verifica
// método HTTP, path, credencial (client key vs per-agent token) y body por método.
// Si alguien cambia una firma en el SDK sin actualizar el doc/servidor, esto falla.

const BASE = "https://x.test";
const ID = "agent1";
const TOK = "pool_abc";
const KEY = "eb_key";

function mockFetch() {
  const calls: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  global.fetch = vi.fn(async (url: unknown, opts: any) => {
    calls.push({
      url: String(url),
      method: opts?.method ?? "GET",
      headers: (opts?.headers ?? {}) as Record<string, string>,
      body: opts?.body,
    });
    return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => "{}" } as any;
  }) as any;
  return calls;
}

describe("eb.fleet.* contract", () => {
  let calls: ReturnType<typeof mockFetch>;
  let eb: EasybitsClient;
  beforeEach(() => {
    calls = mockFetch();
    eb = new EasybitsClient({ apiKey: KEY, baseUrl: BASE });
  });

  const last = () => calls[calls.length - 1];
  const url = (p: string) => `${BASE}/api/v2${p}`;

  it("create → POST /fleet-agents con la credencial del cliente", async () => {
    await eb.fleet.create({ name: "T", engine: "deepseek" });
    expect(last().method).toBe("POST");
    expect(last().url).toBe(url("/fleet-agents"));
    expect(last().headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(last().body!)).toEqual({ name: "T", engine: "deepseek" });
  });

  it("list → GET /fleet-agents", async () => {
    await eb.fleet.list();
    expect(last().method).toBe("GET");
    expect(last().url).toBe(url("/fleet-agents"));
    expect(last().headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it("delete → POST /fleet-agents/:id/delete", async () => {
    await eb.fleet.delete(ID);
    expect(last().method).toBe("POST");
    expect(last().url).toBe(url(`/fleet-agents/${ID}/delete`));
  });

  it("getCapabilities → GET capabilities con el token del agente", async () => {
    await eb.fleet.getCapabilities(ID, TOK);
    expect(last().method).toBe("GET");
    expect(last().url).toBe(url(`/fleet-agents/${ID}/capabilities`));
    expect(last().headers.Authorization).toBe(`Bearer ${TOK}`);
  });

  it("getCapabilities con q → querystring", async () => {
    await eb.fleet.getCapabilities(ID, TOK, { q: "cot" });
    expect(last().url).toBe(url(`/fleet-agents/${ID}/capabilities?q=cot`));
  });

  it("setName → POST {action:set-name} con token del agente", async () => {
    await eb.fleet.setName(ID, TOK, "Tania");
    expect(last().url).toBe(url(`/fleet-agents/${ID}/capabilities`));
    expect(last().headers.Authorization).toBe(`Bearer ${TOK}`);
    expect(JSON.parse(last().body!)).toEqual({ action: "set-name", name: "Tania" });
  });

  it("setModel / setEffort / setAgentPrompt → acciones agent-level", async () => {
    await eb.fleet.setModel(ID, TOK, "claude-sonnet-4-6");
    expect(JSON.parse(last().body!)).toEqual({ action: "set-model", model: "claude-sonnet-4-6" });
    await eb.fleet.setEffort(ID, TOK, "high");
    expect(JSON.parse(last().body!)).toEqual({ action: "set-effort", effort: "high" });
    await eb.fleet.setAgentPrompt(ID, TOK, "hola");
    expect(JSON.parse(last().body!)).toEqual({ action: "set-agent-prompt", systemPrompt: "hola" });
  });

  it("setToolGroup → per-canal incluye groupId + buckets", async () => {
    await eb.fleet.setToolGroup(ID, TOK, "*", { buckets: ["db", "db-write"] });
    expect(JSON.parse(last().body!)).toEqual({ action: "set-toolgroup", groupId: "*", buckets: ["db", "db-write"] });
  });

  it("setSecret → {action:set-secret, name, value}", async () => {
    await eb.fleet.setSecret(ID, TOK, { name: "DEEPSEEK_API_KEY", value: "sk-x" });
    expect(JSON.parse(last().body!)).toEqual({ action: "set-secret", name: "DEEPSEEK_API_KEY", value: "sk-x" });
  });

  it("waba.config → POST /waba/config con token del agente", async () => {
    await eb.fleet.waba.config(ID, TOK, { foo: 1 });
    expect(last().method).toBe("POST");
    expect(last().url).toBe(url(`/fleet-agents/${ID}/waba/config`));
    expect(last().headers.Authorization).toBe(`Bearer ${TOK}`);
  });

  it("message → POST /message con token del agente", async () => {
    await eb.fleet.message(ID, TOK, { groupId: "web-1", text: "hola" });
    expect(last().method).toBe("POST");
    expect(last().url).toBe(url(`/fleet-agents/${ID}/message`));
    expect(JSON.parse(last().body!)).toEqual({ groupId: "web-1", text: "hola" });
  });
});
