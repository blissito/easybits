import { describe, it, expect } from "vitest";
import { createMcpServer, getRegisteredTools } from "../app/.server/mcp/server";
import { GHOSTYAPP_ALLOWLIST, GHOSTY_ALLOWLIST } from "../app/.server/mcp/toolGroups";

// El toolset del agente que vive en el TELÉFONO. Es un recorte por audiencia: lo que se
// prueba aquí no es que funcione una tool, es que NO haya de más — cada una que sobra
// empeora la elección del modelo, que es la razón entera de que el grupo exista.
function visibles(groups: string[]): Set<string> {
  const tools = getRegisteredTools(createMcpServer(groups)) as Record<string, { enabled?: boolean }>;
  return new Set(
    Object.entries(tools)
      .filter(([, t]) => t.enabled !== false)
      .map(([name]) => name),
  );
}

/** Meta-tools que sobreviven a cualquier pasada de disable: no cuentan como superficie. */
const META = ["discover_tools", "run_tool"];

describe("toolset ghostyapp — el agente del teléfono", () => {
  it("expone imágenes y web, que es para lo que existe", () => {
    const v = visibles(["ghostyapp"]);
    for (const t of [
      "create_or_edit_image",
      "transform_image",
      "web_search",
      "web_fetch",
      "web_extract",
      "web_extract_status",
      "search_stock_photo",
      "search_icon",
      "screenshot_url",
      "create_share_link",
    ]) {
      expect(v.has(t), `falta ${t}`).toBe(true);
    }
  });

  it("no trae nada que no se haga desde un móvil", () => {
    const v = visibles(["ghostyapp"]);
    // DB: el motivo original de no reusar el set `ghosty`, que la trae entera.
    for (const t of ["db_create", "db_query", "db_exec"]) {
      expect(v.has(t), `${t} no debería estar`).toBe(false);
    }
    // Y el resto de lo que se dejó fuera a propósito.
    for (const t of ["create_website", "create_form", "create_brand_kit", "sandbox_create"]) {
      expect(v.has(t), `${t} no debería estar`).toBe(false);
    }
  });

  it("deja fuera web_crawl: recorrer un sitio desde un móvil es lento y caro", () => {
    expect(GHOSTYAPP_ALLOWLIST.has("web_crawl")).toBe(false);
  });

  it("no mete alias deprecados: dos nombres para la misma tool", () => {
    // `research_search` y `research_scrape` son alias de `web_search` / `web_fetch`.
    expect(GHOSTYAPP_ALLOWLIST.has("research_search")).toBe(false);
    expect(GHOSTYAPP_ALLOWLIST.has("research_scrape")).toBe(false);
  });

  it("es más chico que el set de DeepSeek, que es el punto", () => {
    expect(GHOSTYAPP_ALLOWLIST.size).toBeLessThan(GHOSTY_ALLOWLIST.size);
    // Un techo explícito: si alguien lo engorda sin querer, este test lo dice. Subirlo es
    // una decisión, no un accidente.
    expect(GHOSTYAPP_ALLOWLIST.size).toBeLessThanOrEqual(12);
  });

  it("y `ghosty` sigue intacto: lo usan los agentes DeepSeek en producción", () => {
    const v = visibles(["ghosty"]);
    expect(v.has("db_query")).toBe(true);
    expect(v.has("create_document")).toBe(true);
  });
});

// ⚠️ Antes, un nombre de grupo que no existía NO fallaba: `needsAllowlist` se quedaba en
// false, no se filtraba nada, y eso equivale a `all` — el catálogo ENTERO, sandbox, flota,
// pagos y correo incluidos. Un typo en el arranque de una caja bastaba, y en silencio.
describe("un toolset desconocido falla CERRADO", () => {
  it("no abre el catálogo entero", () => {
    const v = visibles(["noexiste"]);
    expect(v.has("sandbox_create"), "una tool de sandbox no puede estar aquí").toBe(false);
    expect(v.has("db_exec")).toBe(false);
  });

  it("cae a `core`, que es el suelo", () => {
    const inventado = [...visibles(["noexiste"])].filter((t) => !META.includes(t)).sort();
    const core = [...visibles(["core"])].filter((t) => !META.includes(t)).sort();
    expect(inventado).toEqual(core);
  });

  it("un grupo válido junto a uno inventado sigue sirviendo el válido", () => {
    const v = visibles(["ghostyapp", "noexiste"]);
    expect(v.has("create_or_edit_image")).toBe(true);
    expect(v.has("sandbox_create")).toBe(false);
  });
});
