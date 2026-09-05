import { describe, it, expect } from "vitest";
import { getDocsMarkdown, VALID_SECTIONS } from "~/.server/docs/reference";
import { getToolCatalog, renderToolCatalogMarkdown } from "~/.server/docs/toolCatalog";
import { createMcpServer, getRegisteredTools } from "~/.server/mcp/server";
import { DYNAMIC_ONLY_TOOLS } from "~/.server/mcp/toolGroups";

// La documentación para agentes había divergido de la realidad sin que nada lo notara:
// declaraba 99 tools cuando el servidor registraba 246, y omitía familias enteras (`web_*`
// es un producto vendible que era invisible en su propio doc). Estos tests existen para
// que eso vuelva a fallar en CI y no en la cara de un cliente.

describe("catálogo de tools derivado del servidor", () => {
  const registered = getRegisteredTools(createMcpServer(["all"]));
  const enabled = Object.entries(registered)
    .filter(([, t]) => t.enabled !== false)
    .map(([name]) => name);

  it("incluye TODAS las tools habilitadas del servidor real", () => {
    const catalog = new Set(getToolCatalog().map((t) => t.name));
    const missing = enabled.filter((n) => !catalog.has(n));
    expect(missing).toEqual([]);
  });

  it("no anuncia tools deshabilitadas o deprecadas", () => {
    const catalog = getToolCatalog().map((t) => t.name);
    const disabled = Object.entries(registered)
      .filter(([, t]) => t.enabled === false)
      .map(([name]) => name);
    expect(catalog.filter((n) => disabled.includes(n))).toEqual([]);
  });

  it("incluye web_search — la familia que llevaba meses fuera del doc", () => {
    expect(getToolCatalog().some((t) => t.name === "web_search")).toBe(true);
  });

  it("toda tool cae en un grupo con nombre (nada queda en 'otras')", () => {
    expect(getToolCatalog().filter((t) => t.group === "otras")).toEqual([]);
  });

  it("el conteo del encabezado coincide con las filas reales", () => {
    const md = renderToolCatalogMarkdown();
    const declared = Number(md.match(/## All MCP Tools \((\d+) tools\)/)?.[1]);
    const rows = (md.match(/^\| `[a-z_0-9]+` \|/gm) ?? []).length;
    expect(declared).toBe(getToolCatalog().length);
    expect(rows).toBe(declared);
  });

  it("get_docs NO está oculta: es la tool con la que un agente aprende el producto", () => {
    // Estuvo en DYNAMIC_ONLY_TOOLS con el comentario "→ get_document / list_documents",
    // confundida con las tools de *documentos*. Ningún agente la veía en tools/list.
    expect(DYNAMIC_ONLY_TOOLS.has("get_docs")).toBe(false);
  });
});

describe("secciones de la referencia", () => {
  it("todas las secciones declaradas son alcanzables", async () => {
    for (const key of VALID_SECTIONS) {
      const content = await getDocsMarkdown(key);
      expect(content.startsWith("Unknown section"), `sección "${key}" inalcanzable`).toBe(false);
      expect(content.length, `sección "${key}" vacía`).toBeGreaterThan(20);
    }
  });

  it("videoProjects es alcanzable — el `toLowerCase()` la hacía invisible", async () => {
    expect((await getDocsMarkdown("videoProjects")).startsWith("Unknown")).toBe(false);
    expect((await getDocsMarkdown("videoprojects")).startsWith("Unknown")).toBe(false);
  });

  it("`about` va primero: es la que responde '¿me sirve?'", () => {
    expect(VALID_SECTIONS[0]).toBe("about");
  });
});

describe("posicionamiento", () => {
  it("el doc de agentes ya no se describe como 'file storage'", async () => {
    const full = await getDocsMarkdown();
    expect(/agentic-first file storage/i.test(full)).toBe(false);
  });

  it("`about` menciona las superficies que el producto vende hoy", async () => {
    const about = await getDocsMarkdown("about");
    for (const t of ["Sandbox", "Web", "WhatsApp", "Hosting", "Bases de datos"]) {
      expect(about, `about no menciona ${t}`).toContain(t);
    }
  });
});

describe("el índice no puede volver a ser un volcado", () => {
  it("/llms.txt se mantiene pequeño", async () => {
    // Servía 111 KB (~28k tokens). Un agente que pregunta "¿me sirve?" no debería pagar
    // más contexto por el documento que por la respuesta.
    const { loader } = await import("~/routes/llms.txt");
    const body = await (await (loader as () => Promise<Response>)()).text();
    expect(body.length).toBeLessThan(8_000);
    // Y debe seguir respondiendo la pregunta en la parte de arriba.
    const head = body.slice(0, 1_000);
    for (const t of ["Sandboxes", "Web", "WhatsApp"]) expect(head).toContain(t);
  });

  it("enlaza cada sección para que se carguen sueltas", async () => {
    const { loader } = await import("~/routes/llms.txt");
    const body = await (await (loader as () => Promise<Response>)()).text();
    for (const key of VALID_SECTIONS) expect(body).toContain(`/llms/${key}.txt`);
  });
});

describe("puente entre las dos fuentes de docs", () => {
  // `docs.tsx` (humanos) y `reference.ts` (agentes) son archivos separados y ya
  // divergieron: se documentó la superficie de flota en el primero y el segundo se quedó
  // sin `configGroupId` — el campo que más rota integraciones — ni los tokens con scope.
  it("los conceptos que un integrador necesita existen también para agentes", async () => {
    const full = await getDocsMarkdown();
    for (const concept of ["configGroupId", "flt_pk_", "session-token", "MESSAGE"]) {
      expect(full, `"${concept}" sólo está en los docs de humanos`).toContain(concept);
    }
  });
});
