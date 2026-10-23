import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// El navegador con estado vive en la caja de render; aquí sólo importa el contrato HTTP
// con ella (ruta, payload) y que «la sesión ya no existe» llegue como error propio.
vi.mock("~/.server/db", () => ({ db: {} }));
vi.mock("~/.server/core/fleetServiceOperations", () => ({
  ensureServiceBox: vi.fn(async () => ({ sandboxId: "sb_1", renderUrl: "http://box:9300" })),
  touchServiceBox: vi.fn(),
}));

const { browserOnBox, BrowserSessionGone } = await import("~/.server/core/renderClient");
const ctx = { user: { id: "u1" }, scopes: ["READ", "WRITE"] } as any;

describe("browserOnBox — navegador con estado en la caja de render", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("act manda las acciones a /browser/act y devuelve la vista", async () => {
    const view = { sessionId: "s1", url: "https://x.mx/", title: "X", elements: [], text: "hola", textTruncated: false, done: 1, failed: null };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(view), { status: 200 }));
    const r = await browserOnBox(ctx, "act", { sessionId: "s1", actions: [{ type: "press", key: "Enter" }] });
    expect(fetchMock.mock.calls[0][0]).toBe("http://box:9300/browser/act");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ sessionId: "s1", actions: [{ type: "press", key: "Enter" }] });
    expect(r).toEqual(view);
  });

  it("404 session_gone → BrowserSessionGone (abrir otra, no reintentar)", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "session_gone" }), { status: 404 }));
    await expect(browserOnBox(ctx, "look", { sessionId: "viejo" })).rejects.toBeInstanceOf(BrowserSessionGone);
  });

  it("un 404 de ruta (caja sin el endpoint) NO se confunde con sesión perdida", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "not found" }), { status: 404 }));
    await expect(browserOnBox(ctx, "open", { url: "https://x.mx" })).rejects.not.toBeInstanceOf(BrowserSessionGone);
  });
});
