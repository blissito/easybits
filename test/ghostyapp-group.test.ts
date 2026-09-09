import { describe, it, expect } from "vitest";
import { createMcpServer, getRegisteredTools } from "../app/.server/mcp/server";
import {
  GHOSTYAPP_ALLOWLIST,
  GHOSTY_ALLOWLIST,
  GROUP_HIDDEN_SCOPE,
  TOOL_GROUPS,
} from "../app/.server/mcp/toolGroups";

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

/**
 * ¿`run_tool` ALCANZA esta tool? No es lo mismo que verla en `tools/list`.
 *
 * ⚠️ Se pregunta por NOMBRE, con `query`. Listar y buscar dentro no vale: el catálogo pasa
 * del tope de 200 de `discover_tools`, así que una tool ausente podría ser sólo una tool
 * truncada — un falso negativo que haría pasar por candado lo que es un corte de lista.
 */
async function enAlcance(groups: string[], name: string, deny?: string[]): Promise<boolean> {
  const tools = getRegisteredTools(createMcpServer(groups, deny)) as Record<
    string,
    { handler: (a: unknown, e: unknown) => Promise<{ content: Array<{ text: string }> }> }
  >;
  const res = await tools["discover_tools"].handler({ query: name, limit: 200 }, {});
  const items = JSON.parse(res.content[0].text).items as Array<{ name: string }>;
  return items.some((i) => i.name === name);
}

/** Despacha `run_tool` como lo haría el SDK, leyendo su handler del registro. */
async function despachar(groups: string[], name: string) {
  const tools = getRegisteredTools(createMcpServer(groups)) as Record<
    string,
    { handler: (a: unknown, e: unknown) => Promise<{ isError?: boolean; content: Array<{ text: string }> }> }
  >;
  return tools["run_tool"].handler({ name, params: {} }, {});
}

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

// ─────────────────────────────────────────────────────────────────────────────
// El candado. Hasta el 2026-09-09 el perfil de 10 tools era DECORATIVO: `run_tool`
// despacha desde `_registeredTools` sin mirar si la tool está deshabilitada, y sin modo
// strict no hay scope — o sea que el agente del teléfono alcanzaba las ~186 del catálogo,
// sandbox, flota, pagos y correo incluidos. Lo dice el comentario de dynamicTools.ts:
// «making any profile UI theater».
// ─────────────────────────────────────────────────────────────────────────────
describe("el perfil del teléfono acota run_tool de verdad", () => {
  it("los sitios se ALCANZAN por run_tool", async () => {
    for (const t of ["create_website", "deploy_website_file", "inject_html", "list_websites"]) {
      expect(await enAlcance(["ghostyapp"], t), `${t} debería alcanzarse`).toBe(true);
    }
  });

  it("…pero NO se ven en tools/list: el picker del modelo sigue en 10", () => {
    const v = visibles(["ghostyapp"]);
    for (const t of GROUP_HIDDEN_SCOPE.ghostyapp!) {
      expect(v.has(t), `${t} no puede estar visible`).toBe(false);
    }
    expect([...v].filter((t) => !META.includes(t)).length).toBe(10);
  });

  it("y lo demás queda FUERA DE ALCANCE, que es lo que antes no pasaba", async () => {
    for (const t of ["sandbox_create", "db_query", "db_exec", "create_document", "get_usage_stats"]) {
      expect(await enAlcance(["ghostyapp"], t), `${t} no debería alcanzarse`).toBe(false);
    }
    const res = await despachar(["ghostyapp"], "sandbox_create");
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/no está permitida en el perfil/i);
  });

  it("el strict NO depende de pedir `scripting`", () => {
    // Pedirlo era el camino obvio y está mal: el allowlist es la UNIÓN, así que las tres
    // tools de scripting asomarían en tools/list. Este test guarda contra ese "arreglo".
    const v = visibles(["ghostyapp"]);
    for (const t of ["list_files", "get_file", "upload_file"]) {
      expect(v.has(t), `${t} no debería verse en el perfil del teléfono`).toBe(false);
    }
  });

  it("`all` no evapora el candado", async () => {
    expect(await enAlcance(["ghostyapp", "all"], "sandbox_create")).toBe(false);
  });

  it("un deny por tool cierra TAMBIÉN run_tool", async () => {
    expect(await enAlcance(["ghostyapp"], "create_website", ["create_website"])).toBe(false);
    expect(await enAlcance(["ghostyapp"], "deploy_website_file", ["create_website"])).toBe(true);
  });

  it("toolCount sigue diciendo la verdad", () => {
    const g = TOOL_GROUPS.find((x) => x.key === "ghostyapp")!;
    expect(g.toolCount).toBe(GHOSTYAPP_ALLOWLIST.size);
    expect(g.toolCount).toBe(10);
    expect(GROUP_HIDDEN_SCOPE.ghostyapp!.size).toBe(9);
  });
});

// El escape-hatch de los demás clientes NO se toca: Claude.ai pide grupos sin `scripting` y
// llega al catálogo completo por run_tool. Quitárselo aquí sería un cambio que nadie pidió.
describe("los demás clientes conservan su escape-hatch", () => {
  it("un grupo no-strict sigue alcanzando el catálogo entero", async () => {
    expect(await enAlcance(["design"], "sandbox_create")).toBe(true);
  });

  it("y `ghosty` (DeepSeek, producción) también", async () => {
    expect(await enAlcance(["ghosty"], "sandbox_create")).toBe(true);
  });
});
