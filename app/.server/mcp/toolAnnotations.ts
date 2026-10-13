import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Título y hints de cada tool (MCP `ToolAnnotations`).
//
// El Connectors Directory de Claude exige que TODA tool traiga `title` y diga si sólo
// lee (`readOnlyHint`) o si puede destruir (`destructiveHint`). Son 270 tools
// registradas con `server.tool(...)`; escribirlo a mano en cada una se desincroniza a la
// primera tool nueva. Aquí se deriva del nombre (los verbos del catálogo son
// consistentes) con excepciones explícitas, y `test/mcpAnnotations.test.ts` falla si
// una tool se queda sin clasificar.
//
// Ojo con el default del spec: si `readOnlyHint` es false y `destructiveHint` no viene,
// el cliente asume `destructiveHint: true`. Por eso siempre se escribe explícito.
// Lo que una tool ya declara a mano gana sobre lo derivado.

/** Sólo leen (o calculan sin dejar nada guardado en la cuenta). */
const READ_ONLY = new Set([
  "sandbox_status",
  "sandbox_logs",
  "sandbox_runtime",
  "sandbox_files_read",
  "sandbox_files_list",
  "sandbox_git_status",
  "sandbox_git_log",
  "sandbox_get_network_policy",
  "sandbox_domain_list",
  "sandbox_exec_status",
  "sandbox_exec_list",
  "templates_list",
  "agent_list",
  "agent_run_status",
  "agent_recording_list",
  "fleet_agent_list",
  "fleet_agent_messages",
  "fleet_agent_capabilities",
  "call_status",
  "call_files",
  "call_transcript",
  "service_status",
  "secret_list",
  "db_list",
  "db_get",
  "db_select",
  "character_list",
  "wait_for_document",
  "discover_tools",
  "describe_image",
  "web_fetch",
  "web_search",
  "web_extract_status",
  "research_scrape",
  "research_search",
  "audit_page",
  "compare_render",
  "enhance_document_prompt",
]);

/** Pueden borrar, sobrescribir o ejecutar código arbitrario: piden confirmación. */
const DESTRUCTIVE = new Set([
  "sandbox_exec",
  "sandbox_exec_background",
  "sandbox_exec_kill",
  "sandbox_run_code",
  "sandbox_run_cell",
  "sandbox_kernel_restart",
  "sandbox_files_write",
  "sandbox_files_edit",
  "sandbox_files_move",
  "sandbox_apply_patch",
  "sandbox_git_push",
  "sandbox_git_pull",
  "sandbox_git_checkout",
  "sandbox_suspend",
  "sandbox_set_network_policy",
  "sandbox_set_bootstrap",
  "sandbox_ssh_disable",
  "db_query",
  "db_exec",
  "set_ai_key",
  "secret_set",
  "service_stop",
  "call_stop",
  "fleet_agent_configure",
  "set_page_html",
  "set_section_html",
  "replace_html",
  "patch_node",
  "set_video_scene",
  "set_video_music",
  "set_domain_website",
  "change_document_format",
  "apply_brand_kit",
  "regenerate_document_page",
  "refine_document_section",
  "inject_html",
  "deploy_website_file",
  "run_tool",
]);

/** Prefijos/sufijos que sólo leen. */
const READ_ONLY_PATTERN = /^(list|get|search|describe)_|_(list|status)$/;
/** Prefijos/fragmentos que destruyen. */
const DESTRUCTIVE_PATTERN = /(^|_)(delete|destroy|revoke|remove|unpublish|unexpose)(_|$)|^update_|^edit_/;
/** Tocan sistemas fuera de EasyBits (internet, correo, otros servicios). */
const OPEN_WORLD_PATTERN =
  /^(web_|research_|screenshot_url|audit_page|send_|create_broadcast|extract_brand_kit_from_url|sandbox_git_|sandbox_domain_|search_stock_photo|search_icon|ghosty_spawn|goose_spawn|agent_|call_)/;

const ACRONYMS: Record<string, string> = {
  ai: "AI",
  db: "DB",
  html: "HTML",
  pdf: "PDF",
  url: "URL",
  ssh: "SSH",
  tts: "TTS",
  geo: "GEO",
  id: "ID",
  sql: "SQL",
  api: "API",
};

/** `list_share_links` → «List share links». */
export function titleFromName(name: string): string {
  const words = name.split("_").map((w) => ACRONYMS[w] ?? w);
  const first = words[0];
  words[0] = first === first.toUpperCase() ? first : first[0].toUpperCase() + first.slice(1);
  return words.join(" ");
}

export type DerivedAnnotations = {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  openWorldHint: boolean;
};

export function deriveAnnotations(name: string): DerivedAnnotations {
  const readOnly =
    READ_ONLY.has(name) || (!DESTRUCTIVE.has(name) && !DESTRUCTIVE_PATTERN.test(name) && READ_ONLY_PATTERN.test(name));
  const destructive = !readOnly && (DESTRUCTIVE.has(name) || DESTRUCTIVE_PATTERN.test(name));
  return {
    title: titleFromName(name),
    readOnlyHint: readOnly,
    destructiveHint: destructive,
    openWorldHint: OPEN_WORLD_PATTERN.test(name),
  };
}

/** Rellena `title` y hints en cada tool registrada, sin pisar lo que ya trae a mano. */
export function applyToolAnnotations(server: McpServer): void {
  const tools = (server as any)._registeredTools as Record<
    string,
    { title?: string; annotations?: Record<string, unknown> }
  >;
  for (const [name, tool] of Object.entries(tools)) {
    const derived = deriveAnnotations(name);
    const own = tool.annotations ?? {};
    // Una tool que ya declara `destructiveHint` a mano escribe: no se le deriva lectura.
    const readOnlyHint =
      (own.readOnlyHint as boolean | undefined) ??
      (own.destructiveHint !== undefined ? false : derived.readOnlyHint);
    const title = tool.title ?? (own.title as string | undefined) ?? derived.title;
    tool.title = title;
    tool.annotations = {
      title,
      readOnlyHint,
      // Una tool de sólo lectura no destruye; si no, lo derivado (explícito, ver arriba).
      destructiveHint: readOnlyHint ? false : ((own.destructiveHint as boolean | undefined) ?? derived.destructiveHint),
      openWorldHint: (own.openWorldHint as boolean | undefined) ?? derived.openWorldHint,
      ...(own.idempotentHint !== undefined ? { idempotentHint: own.idempotentHint } : {}),
    };
  }
}
