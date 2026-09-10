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

  // ── Replay con cursor: la vuelta del viaje que empieza en `turn.completed` ──
  it("messages → GET /messages con el token del agente", async () => {
    await eb.fleet.messages(ID, TOK, { groupId: "web-1" });
    expect(last().method).toBe("GET");
    expect(last().url).toBe(url(`/fleet-agents/${ID}/messages?groupId=web-1`));
    // Token del AGENTE (scope MESSAGE), no la llave del cliente: así un `flt_pk_`
    // efímero de navegador puede leer su propio hilo sin permisos de administración.
    expect(last().headers.Authorization).toBe(`Bearer ${TOK}`);
  });

  it("messages → pasa since y limit, y NO los manda si no se piden", async () => {
    await eb.fleet.messages(ID, TOK, { groupId: "web-1", since: "cur+/=", limit: 25 });
    // El cursor es base64url y aun así se codifica: un `+` sin escapar llegaría como
    // espacio al servidor y el delta saldría mal.
    expect(last().url).toBe(url(`/fleet-agents/${ID}/messages?groupId=web-1&since=cur%2B%2F%3D&limit=25`));

    await eb.fleet.messages(ID, TOK, { groupId: "web-1" });
    expect(last().url).not.toContain("since");
    expect(last().url).not.toContain("limit");
  });

  // ── Baileys connection flow — auth = client credential (owner), NO per-agent token ──
  it("connect → POST /connect con credencial del cliente (QR o pairingPhone)", async () => {
    await eb.fleet.connect(ID, { pairingPhone: "5215500000000" });
    expect(last().method).toBe("POST");
    expect(last().url).toBe(url(`/fleet-agents/${ID}/connect`));
    expect(last().headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(last().body!)).toEqual({ pairingPhone: "5215500000000" });
  });

  it("connectionState → GET /connect", async () => {
    await eb.fleet.connectionState(ID);
    expect(last().method).toBe("GET");
    expect(last().url).toBe(url(`/fleet-agents/${ID}/connect`));
  });

  it("disconnect → POST /connect?disconnect=1", async () => {
    await eb.fleet.disconnect(ID);
    expect(last().url).toBe(url(`/fleet-agents/${ID}/connect?disconnect=1`));
  });

  it("listGroups → GET /groups con credencial del cliente", async () => {
    await eb.fleet.listGroups(ID);
    expect(last().method).toBe("GET");
    expect(last().url).toBe(url(`/fleet-agents/${ID}/groups`));
    expect(last().headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it("toggleGroup → POST /groups {groupId,on}", async () => {
    await eb.fleet.toggleGroup(ID, "123@g.us", true);
    expect(last().url).toBe(url(`/fleet-agents/${ID}/groups`));
    expect(JSON.parse(last().body!)).toEqual({ groupId: "123@g.us", on: true });
  });

  it("setMain → POST /groups {groupId,main:true}", async () => {
    await eb.fleet.setMain(ID, "123@g.us");
    expect(JSON.parse(last().body!)).toEqual({ groupId: "123@g.us", main: true });
  });

  it("connection flow acepta token override (reseller fleetToken) sobre la credencial del cliente", async () => {
    await eb.fleet.connect(ID, { pairingPhone: "521", token: TOK });
    expect(last().headers.Authorization).toBe(`Bearer ${TOK}`);
    expect(JSON.parse(last().body!)).toEqual({ pairingPhone: "521" }); // token NO va en el body
    await eb.fleet.listGroups(ID, TOK);
    expect(last().headers.Authorization).toBe(`Bearer ${TOK}`);
    await eb.fleet.toggleGroup(ID, "g@g.us", true, TOK);
    expect(last().headers.Authorization).toBe(`Bearer ${TOK}`);
    // sin token → credencial del cliente
    await eb.fleet.connectionState(ID);
    expect(last().headers.Authorization).toBe(`Bearer ${KEY}`);
  });
});

// Congela el contrato de la búsqueda de fotos de stock — la superficie SDK de
// `image.stock.search`. Lo que importa es el path y cómo viaja `save`: el
// servidor exige scope WRITE sólo cuando viene, así que mandarlo de más
// convertiría una lectura en una escritura.
describe("eb.searchStockPhoto contract", () => {
  let calls: ReturnType<typeof mockFetch>;
  let eb: EasybitsClient;
  beforeEach(() => {
    calls = mockFetch();
    eb = new EasybitsClient({ apiKey: KEY, baseUrl: BASE });
  });
  const last = () => calls[calls.length - 1];

  it("GET /stock-photos con la query codificada", async () => {
    await eb.searchStockPhoto({ query: "barbershop interior" });
    expect(last().method).toBe("GET");
    expect(last().url).toBe(`${BASE}/api/v2/stock-photos?q=barbershop+interior`);
    expect(last().headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it("no manda `save` cuando no se pidió", async () => {
    await eb.searchStockPhoto({ query: "gym" });
    expect(last().url).not.toContain("save");
  });

  it("manda save=true cuando se pide guardar", async () => {
    await eb.searchStockPhoto({ query: "gym", save: true });
    expect(last().url).toBe(`${BASE}/api/v2/stock-photos?q=gym&save=true`);
  });
});

/**
 * El verificador de firma vive en el SDK porque, si no lo damos, cada integrador lo
 * reimplementa mal: comparando con `===`, firmando el JSON re-serializado en vez del
 * cuerpo crudo, o saltándoselo. Un webhook sin verificar es un endpoint público que
 * acepta órdenes de cualquiera.
 */
describe("verifyWebhookSignature", () => {
  const SECRET = "whsec_" + "ab".repeat(24);
  const BODY = JSON.stringify({ event: "turn.completed", data: { turnId: "t1", summary: "Ácentos 🎉" } });

  /** El firmante REAL del servidor (app/.server/webhooks.ts), copiado a mano. */
  async function firmaDelServidor(body: string, secret: string) {
    const { createHmac } = await import("node:crypto");
    return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  }

  it("acepta una firma hecha por el servidor", async () => {
    const { verifyWebhookSignature } = await import("../packages/sdk/src/index");
    expect(await verifyWebhookSignature(BODY, await firmaDelServidor(BODY, SECRET), SECRET)).toBe(true);
  });

  it("rechaza cuerpo alterado, secreto distinto y header ausente o basura", async () => {
    const { verifyWebhookSignature } = await import("../packages/sdk/src/index");
    const firma = await firmaDelServidor(BODY, SECRET);
    expect(await verifyWebhookSignature(BODY + " ", firma, SECRET)).toBe(false);
    expect(await verifyWebhookSignature(BODY, firma, "otro-secreto")).toBe(false);
    expect(await verifyWebhookSignature(BODY, null, SECRET)).toBe(false);
    expect(await verifyWebhookSignature(BODY, "sha256=00", SECRET)).toBe(false);
    expect(await verifyWebhookSignature(BODY, firma, "")).toBe(false);
  });
});
