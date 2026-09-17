// Lógica del MCP de docs (/mcp/docs). Vive en .server para que la ruta sólo exporte loader/action.
import MiniSearch from "minisearch";
import { getDocsMarkdown, VALID_SECTIONS, EN_SECTION_KEYS } from "./reference";
import openapiYaml from "../../../public/openapi.yaml?raw";

const PROTOCOL = "2025-06-18";
const SITE = "https://www.easybits.cloud";

export const TOOLS = [
  {
    name: "search_docs",
    description:
      "Busca en la documentación de EasyBits (búsqueda léxica por encabezado y texto). Devuelve hasta 8 fragmentos con sección, encabezado, extracto y URL del .md. Úsala antes de read_doc.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Palabras clave, p. ej. «launch_app», «suspendOnIdle», «web_extract»." } },
      required: ["query"],
    },
  },
  {
    name: "read_doc",
    description: "Devuelve una sección completa de la documentación en markdown, por su clave (p. ej. «agents», «hosting», «files»). Usa list_docs para ver las claves.",
    inputSchema: {
      type: "object",
      properties: { section: { type: "string" }, locale: { type: "string", enum: ["es", "en"], description: "en sólo para: " + EN_SECTION_KEYS.join(", ") } },
      required: ["section"],
    },
  },
  {
    name: "openapi",
    description: "Devuelve la especificación OpenAPI 3.1 de la REST API v2 de EasyBits (YAML). Fuente de verdad de paths, cuerpos y respuestas.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_docs",
    description: "Lista las secciones de la documentación con su clave, título y URL del markdown.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "tools_catalog",
    description: "Catálogo público de las tools del MCP de EasyBits (nombre, descripción y grupo), generado del servidor. Sin auth.",
    inputSchema: { type: "object", properties: { group: { type: "string", description: "Filtrar por grupo (core, sandbox, web, hosting, docs, fleet…)." } } },
  },
] as const;

type Entry = { id: string; section: string; heading: string; text: string };

let indexPromise: Promise<{ ms: MiniSearch<Entry>; docs: Map<string, Entry>; titles: Map<string, string> }> | null = null;

// Parte cada sección por encabezados; el primer `##` es el título de la sección.
function splitByHeading(section: string, md: string): { title: string; entries: Entry[] } {
  const entries: Entry[] = [];
  let title = section;
  let heading = section;
  let buf: string[] = [];
  let n = 0;
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) entries.push({ id: `${section}#${n++}`, section, heading, text });
    buf = [];
  };
  for (const line of md.split("\n")) {
    const m = line.match(/^(##|###)\s+(.+?)\s*$/);
    if (m) {
      flush();
      heading = m[2].replace(/`/g, "");
      if (m[1] === "##" && title === section) title = heading;
    } else buf.push(line);
  }
  flush();
  return { title, entries };
}

function buildIndex() {
  if (indexPromise) return indexPromise;
  indexPromise = (async () => {
    const ms = new MiniSearch<Entry>({
      fields: ["heading", "text", "section"],
      storeFields: ["section", "heading"],
      searchOptions: { boost: { heading: 4, section: 2 }, prefix: true, fuzzy: 0.15 },
    });
    const docs = new Map<string, Entry>();
    const titles = new Map<string, string>();
    for (const s of VALID_SECTIONS) {
      const { title, entries } = splitByHeading(s, await getDocsMarkdown(s));
      titles.set(s, title);
      for (const e of entries) docs.set(e.id, e);
      ms.addAll(entries);
    }
    return { ms, docs, titles };
  })();
  return indexPromise;
}

function snippet(text: string, query: string): string {
  const q = query.toLowerCase().split(/\s+/).filter(Boolean)[0] ?? "";
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  const start = Math.max(0, i - 80);
  return (start > 0 ? "…" : "") + text.slice(start, start + 240).trim() + "…";
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError?: boolean }> {
  switch (name) {
    case "search_docs": {
      const query = String(args.query ?? "").trim();
      if (!query) return { text: "falta query", isError: true };
      const { ms, docs } = await buildIndex();
      const hits = ms.search(query).slice(0, 8);
      if (!hits.length) return { text: `Sin resultados para «${query}». Prueba list_docs.` };
      const lines = hits.map((h) => {
        const e = docs.get(String(h.id))!;
        return `- **${e.heading}** (sección \`${e.section}\`) — ${SITE}/docs/${e.section}.md\n  ${snippet(e.text, query)}`;
      });
      return { text: lines.join("\n") };
    }
    case "read_doc": {
      const raw = String(args.section ?? "").replace(/\.md$/, "");
      const key = VALID_SECTIONS.find((s) => s.toLowerCase() === raw.toLowerCase());
      if (!key) return { text: `No existe «${raw}». Usa list_docs para ver las claves.`, isError: true };
      return { text: await getDocsMarkdown(key, args.locale === "en" ? "en" : "es") };
    }
    case "openapi":
      return { text: openapiYaml };
    case "list_docs": {
      const { titles } = await buildIndex();
      return { text: VALID_SECTIONS.map((s) => `- \`${s}\` — ${titles.get(s) ?? s}: ${SITE}/docs/${s}.md`).join("\n") };
    }
    case "tools_catalog": {
      const { getToolCatalog } = await import("./toolCatalog");
      const group = args.group ? String(args.group) : null;
      const tools = getToolCatalog().filter((t) => !group || t.group === group);
      if (!tools.length) return { text: `Sin tools en el grupo «${group}».`, isError: true };
      return { text: tools.map((t) => `- \`${t.name}\` [${t.group}] — ${t.description}`).join("\n") };
    }
    default:
      return { text: `tool desconocida: ${name}`, isError: true };
  }
}

export type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

export async function handle(msg: Rpc): Promise<unknown | null> {
  const { id, method, params = {} } = msg;
  if (method?.startsWith("notifications/")) return null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  switch (method) {
    case "initialize":
      return ok({
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "easybits-docs", version: "1.0.0" },
        instructions:
          "Documentación pública de EasyBits (sandboxes, web, archivos, bases de datos, documentos, hosting, flota de agentes). Empieza con search_docs y lee la sección con read_doc. tools_catalog lista las tools del MCP de producto.",
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const name = String((params as { name?: unknown }).name ?? "");
      const args = ((params as { arguments?: unknown }).arguments ?? {}) as Record<string, unknown>;
      const r = await callTool(name, args);
      return ok({ content: [{ type: "text", text: r.text }], isError: r.isError === true });
    }
    default:
      return err(-32601, `método no soportado: ${method}`);
  }
}
