import { describe, it, expect, vi, beforeEach } from "vitest";

// web_interact: valida acciones antes de abrir el navegador, las ejecuta en orden, se detiene
// en la que falla devolviendo la página como quedó, y siempre cierra el navegador.

const log = vi.hoisted(() => [] as string[]);
const pageState = vi.hoisted(() => ({ failOn: "" as string, closed: 0 }));
vi.mock("playwright-core", () => {
  const step = (name: string) => async (...args: unknown[]) => {
    const tag = `${name}:${args.filter((a) => typeof a === "string").join(",")}`;
    if (pageState.failOn && tag.includes(pageState.failOn)) throw new Error(`Timeout 15000ms exceeded waiting for ${pageState.failOn}\nmore`);
    log.push(tag);
  };
  const page = {
    goto: step("goto"),
    click: step("click"),
    fill: step("fill"),
    selectOption: step("select"),
    keyboard: { press: step("press") },
    waitForSelector: step("waitFor"),
    waitForTimeout: async () => undefined,
    waitForLoadState: async () => undefined,
    evaluate: async (fn: unknown) => (typeof fn === "function" && String(fn).includes("innerText") ? "Resultados: 48 audífonos" : undefined),
    url: () => "https://listado.ej.test/audifonos",
    title: async () => "Audífonos",
    screenshot: async () => Buffer.from("png"),
  };
  return {
    chromium: {
      connectOverCDP: async () => ({ newPage: async () => page, close: async () => void pageState.closed++ }),
    },
  };
});
vi.mock("../app/.server/storage", () => ({
  getPlatformDefaultClient: () => ({ putObject: async () => undefined, getReadUrl: async (k: string) => `https://bucket.test/${k}` }),
}));

import { brightdataInteractService, INTERACT_COST, validateActions } from "../app/.server/services/providers/brightdata";

const ME = "a".repeat(24);

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.BRIGHTDATA_API_TOKEN = "t";
  log.length = 0;
  pageState.failOn = "";
  pageState.closed = 0;
  // credenciales de la zona del navegador (API de la cuenta)
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u) =>
    String(u).includes("/status") ? Response.json({ customer: "hl_x" }) : Response.json({ passwords: ["pw"] }),
  );
});

describe("validateActions", () => {
  it("rechaza tipos desconocidos, campos faltantes y más de 25 acciones", () => {
    expect(() => validateActions([{ type: "hack" }])).toThrow(/tipo desconocido/);
    expect(() => validateActions([{ type: "type", selector: "input" }])).toThrow(/falta `text`/);
    expect(() => validateActions(Array.from({ length: 26 }, () => ({ type: "wait" })))).toThrow(/máximo 25/);
    expect(validateActions(undefined)).toEqual([]);
  });
});

describe("web_interact", () => {
  it("ejecuta las acciones en orden y devuelve la página final; cobra tarifa plana y cierra el navegador", async () => {
    const r = await brightdataInteractService.execute(
      {
        url: "https://ej.test",
        actions: [
          { type: "type", selector: "input[name=q]", text: "audifonos" },
          { type: "press", key: "Enter" },
          { type: "click", selector: "text=Ver más" },
        ],
        screenshot: true,
      },
      { userId: ME },
    );
    expect(log).toEqual(["goto:https://ej.test", "fill:input[name=q],audifonos", "press:Enter", "click:text=Ver más"]);
    expect(r.cost).toBe(INTERACT_COST);
    expect(r.data).toMatchObject({ url: "https://listado.ej.test/audifonos", title: "Audífonos", text: "Resultados: 48 audífonos", done: 3, truncated: false });
    expect(r.data.screenshotUrl).toMatch(/^https:\/\/bucket\.test\/interact\//);
    expect(pageState.closed).toBe(1);
  });

  it("si una acción falla se detiene, dice cuál y por qué, y entrega la página como quedó", async () => {
    pageState.failOn = "text=Ver más";
    const r = await brightdataInteractService.execute(
      { url: "https://ej.test", actions: [{ type: "press", key: "Enter" }, { type: "click", selector: "text=Ver más" }, { type: "press", key: "Tab" }] },
      { userId: ME },
    );
    expect(r.data).toMatchObject({ done: 1, failedAt: 1, text: "Resultados: 48 audífonos" });
    expect(r.data.error).toMatch(/Timeout/);
    expect(r.data.error).not.toContain("\n");
    expect(log).not.toContain("press:Tab");
    expect(pageState.closed).toBe(1);
  });

  it("acciones inválidas: 400 antes de abrir el navegador", async () => {
    await expect(brightdataInteractService.execute({ url: "https://ej.test", actions: [{ type: "nope" } as never] }, { userId: ME })).rejects.toMatchObject({
      providerStatus: 400,
    });
    expect(log).toEqual([]);
  });
});
