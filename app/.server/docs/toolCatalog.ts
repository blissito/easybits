import { createMcpServer, getRegisteredTools } from "../mcp/server";
import { TOOL_GROUPS, GROUP_ALLOWLISTS } from "../mcp/toolGroups";

/**
 * Catálogo de tools DERIVADO del servidor MCP real.
 *
 * Antes era una tabla markdown escrita a mano y ya había divergido de forma grave: el
 * título decía "99 tools", la tabla listaba ~104, el encabezado de llms.txt decía "200+"
 * y el servidor registraba 246. Peor que el número: faltaban familias enteras — `web_*`
 * (un producto vendible con packs propios) no aparecía, así que un agente que leía la
 * documentación no sabía que EasyBits puede buscar en internet.
 *
 * Mismo principio que `HOSTING_TIERS_MD` en reference.ts y que el `toolCount = allowlist.size`
 * de toolGroups.ts: lo derivable se genera, y sólo la prosa se escribe a mano.
 */

export type CatalogTool = { name: string; description: string; group: string };

/** Grupos que son PERFILES (recortes por audiencia), no dominios: no agrupan nada. */
const NON_DOMAIN_GROUPS = new Set(["all", "publico", "ghosty", "ghostyapp", "public-safe"]);

// Una tool aparece en varios allowlists porque son perfiles solapados, no una taxonomía.
// Se elige el allowlist MÁS PEQUEÑO que la contiene = la clasificación más específica.
// (Por orden de declaración, `design` —el primero y con 87 tools— se llevaba `web_search`
// y medio catálogo, dejando el grupo `web` vacío en el doc.)
function buildToolGroupIndex(): Map<string, string> {
  const index = new Map<string, string>();
  const domains = TOOL_GROUPS.filter((g) => !NON_DOMAIN_GROUPS.has(g.key) && GROUP_ALLOWLISTS[g.key])
    .sort((a, b) => GROUP_ALLOWLISTS[a.key]!.size - GROUP_ALLOWLISTS[b.key]!.size);
  for (const g of domains) {
    for (const name of GROUP_ALLOWLISTS[g.key]!) {
      if (!index.has(name)) index.set(name, g.key);
    }
  }
  return index;
}

// Familias que no viven en ningún allowlist curado (los grupos sin allowlist cargan su
// categoría entera). Sin este fallback quedarían fuera del catálogo, que es exactamente
// cómo `web_*` llevaba meses sin aparecer en la documentación.
const PREFIX_GROUPS: Array<[RegExp, string]> = [
  [/^web_|^research_/, "web"],
  [/^(sandbox|agent_run|expose_port|run_code|exec)/, "sandbox"],
  [/^(service_|voice_|render_|audit_page)/, "sandbox"],
  [/^(fleet|wa_)/, "fleet"],
  [/^(machine_|launch_app|release|rollback|redeploy)/, "hosting"],
  [/^(secret_|db_)/, "core"],
  [/^(form|list_form)/, "core"],
  [/^(video|avatar_|generate_captions|get_caption)/, "video"],
  [/^(document|page|section|structured_doc|export_document|deploy_document)/, "docs"],
  [/^(image|edit_image|create_or_edit_image|transform_image|optimize_image|describe_image|search_icon|search_stock)/, "design"],
  [/^(brand|template|theme)/, "brand"],
  [/^(website|deploy_website|upload_website|inject_html)/, "sites"],
  [/^(payment|checkout)/, "payments"],
  [/^(email|contact|broadcast|newsletter)/, "email"],
  [/^(bulk_|.*_file$|.*_files$|share_file|duplicate_file|restore_file)/, "core"],
  [/^(.*webhook.*)/, "core"],
  [/^(.*ai_key.*|list_providers)/, "core"],
  [/(website)/, "sites"],
  [/^(discover_tools|run_tool)/, "scripting"],
  [/^agent_/, "sandbox"],
  [/(scorecard|screening_report)/, "magnet"],
  [/^(replace_html|get_document_directions)/, "docs"],
  [/^(get_docs|get_usage_stats|get_learning_progress)/, "core"],
];

function groupFor(name: string, index: Map<string, string>): string {
  const fromAllowlist = index.get(name);
  if (fromAllowlist) return fromAllowlist;
  for (const [re, key] of PREFIX_GROUPS) if (re.test(name)) return key;
  return "otras";
}

// El registro es puro (sin DB ni red), pero recorrerlo en cada request es gasto inútil:
// el catálogo sólo cambia con un deploy.
let cached: CatalogTool[] | null = null;

export function getToolCatalog(): CatalogTool[] {
  if (cached) return cached;
  const registered = getRegisteredTools(createMcpServer(["all"]));
  const index = buildToolGroupIndex();
  cached = Object.entries(registered)
    // `enabled === false` = deprecada u oculta: no se anuncia lo que no queremos que usen.
    .filter(([, t]) => t.enabled !== false)
    .map(([name, t]) => ({
      name,
      description: (t.description ?? "").split("\n")[0].trim(),
      group: groupFor(name, index),
    }))
    .sort((a, b) => (a.group === b.group ? a.name.localeCompare(b.name) : a.group.localeCompare(b.group)));
  return cached;
}

const groupLabel = (key: string) =>
  TOOL_GROUPS.find((g) => g.key === key)?.label ?? (key === "otras" ? "Otras" : key);
const groupDescription = (key: string) => TOOL_GROUPS.find((g) => g.key === key)?.description ?? "";

/** Descripciones largas hacen ilegible una tabla; el detalle está en el schema de la tool. */
const truncate = (s: string, max = 120) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/** La sección `all-mcp-tools` del doc de agentes, generada. */
export function renderToolCatalogMarkdown(): string {
  const tools = getToolCatalog();
  const byGroup = new Map<string, CatalogTool[]>();
  for (const t of tools) {
    const list = byGroup.get(t.group) ?? [];
    list.push(t);
    byGroup.set(t.group, list);
  }
  // El orden de TOOL_GROUPS es el orden de presentación; "otras" al final.
  const order = [...TOOL_GROUPS.map((g) => g.key).filter((k) => byGroup.has(k)), "otras"].filter(
    (k, i, a) => byGroup.has(k) && a.indexOf(k) === i
  );

  const blocks = order.map((key) => {
    const list = byGroup.get(key)!;
    const desc = groupDescription(key);
    return [
      `### ${groupLabel(key)} (${list.length})`,
      desc ? `\n${desc}\n` : "",
      "| Tool | Qué hace |",
      "|------|----------|",
      ...list.map((t) => `| \`${t.name}\` | ${truncate(t.description).replace(/\|/g, "\\|")} |`),
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    `## All MCP Tools (${tools.length} tools)`,
    "",
    "Generado del servidor MCP en cada build — esta lista no puede quedarse desactualizada.",
    "Todas viven en el mismo endpoint (`https://www.easybits.cloud/api/mcp`); los grupos sólo",
    "deciden cuántas se cargan de una (ver `tool-groups`).",
    "",
    ...blocks,
  ].join("\n");
}

/** La sección `tool-groups`, generada de TOOL_GROUPS (cuyo toolCount ya se autodetermina). */
export function renderToolGroupsMarkdown(): string {
  const rows = TOOL_GROUPS.map(
    (g) => `| \`${g.key}\` | ${g.toolCount ?? "—"} | ${g.description.replace(/\|/g, "\\|")} |`
  );
  return [
    "## Tool Groups",
    "",
    "Un solo endpoint MCP sirve todas las tools; el grupo decide cuántas se cargan en la",
    "sesión. Cargar de más gasta contexto y empeora la elección de tool, así que empieza",
    "por el grupo de tu caso y amplía si hace falta.",
    "",
    "| Grupo | Tools | Para qué |",
    "|-------|-------|----------|",
    ...rows,
    "",
    "### stdio (Claude Code, Claude Desktop)",
    "```bash",
    "npx -y @easybits.cloud/mcp --key eb_sk_live_YOUR_KEY --tools design",
    "```",
    "",
    "### HTTP (Cursor, VS Code, Windsurf, Claude.ai)",
    "```",
    "https://www.easybits.cloud/api/mcp?tools=design",
    "```",
    "",
    "¿No sabes cuál? Conéctate sin `--tools` y usa `discover_tools({ query })`: busca en el",
    "catálogo completo y `run_tool` ejecuta cualquiera sin cargarla en la sesión.",
  ].join("\n");
}
