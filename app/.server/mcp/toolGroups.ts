/**
 * Central registry of MCP tool groups.
 *
 * Pure data — safe to import from server (server.ts) and client (dashboard UI).
 * To add a new group: append an entry to TOOL_GROUPS and, if the group needs
 * a curated subset, add its allowlist to GROUP_ALLOWLISTS.
 *
 * A group without an allowlist means "all tools in the registered categories".
 * A group with an allowlist loads all categories referenced by its tools and
 * then filters to exactly the listed names.
 */

export type ToolGroupKey =
  | "core"
  | "design"
  | "docs"
  | "sites"
  | "brand"
  | "magnet"
  | "video"
  | "sandbox"
  | "all";

export interface ToolGroup {
  key: ToolGroupKey;
  label: string;
  description: string;
  /** Shown in the connector UI as the suggested starting point. */
  recommended?: boolean;
  /** Rough count shown to users; keep in sync with allowlist size. */
  toolCount?: number;
}

/** Display order = order users see in the connector UI. */
export const TOOL_GROUPS: ToolGroup[] = [
  {
    key: "design",
    label: "Design",
    description:
      "Canva-like: documentos como diseño universal (cualquier formato — letter, social, slide 16:9), brand kits e imágenes. Ideal para Claude.ai / Claude Design.",
    recommended: true,
    toolCount: 42,
  },
  {
    key: "core",
    label: "Core",
    description: "Lo esencial: archivos, DBs, documentos, forms, websites, brand. Para agentes generalistas.",
    toolCount: 41,
  },
  {
    key: "docs",
    label: "Documents",
    description: "Solo tools de documentos (create/update/deploy + quotations + structured_doc).",
  },
  // REVISIT (2026-04-30): "slides" group removed. Docs (slide-16-9 preset) cubren
  // el caso 2D. Decidir si se rescata el motor 3D como bloque de docs o se elimina.
  // Detalle: memory/todo_revisit_presentations_3d.md
  {
    key: "sites",
    label: "Websites",
    description: "Solo tools de websites (crear, deployar archivos, inject HTML).",
  },
  {
    key: "brand",
    label: "Brand Kits",
    description: "Solo tools de brand kits (CRUD + extract desde URL).",
  },
  {
    key: "magnet",
    label: "Lead Magnet",
    description: "Toolset orquestado para crear lead magnets (PDF + landing + form).",
    toolCount: 14,
  },
  {
    key: "video",
    label: "Video",
    description: "Video con IA (Runway Gen-4.5) + personajes recurrentes. Ghosty decide: recuerda a quién y genera clips con el mismo personaje en escenas distintas. Ideal para WhatsApp.",
    toolCount: 6,
  },
  {
    key: "sandbox",
    label: "Sandbox",
    description: "MicroVMs Firecracker para correr agentes y código aislado. Spawn, exec, archivos, destroy + agent_run (Claude managed con billing por token). Ideal para harness de agentes (Claude Code, Codex) y ejecución segura.",
    toolCount: 10,
  },
  {
    key: "all",
    label: "All tools",
    description: "Todas las tools disponibles (~50+). Ideal para agentes avanzados.",
  },
];

/**
 * Curated "Design" allowlist — Canva-like experience inside Claude.ai.
 * Exposes visual creation + deploy + brand, hides DB/forms/webhooks.
 */
export const DESIGN_ALLOWLIST = new Set<string>([
  // Documents — CRUD
  "list_documents", "get_document",
  "create_document", "update_document", "delete_document",
  "duplicate_document",
  "open_design_in_editor",
  // Documents — pages
  "set_page_html", "get_page_html",
  "add_page", "delete_page", "reorder_pages",
  "get_page_screenshot",
  // Documents — sections (granular edits)
  "get_section_html", "set_section_html",
  "replace_html",
  // Documents — AI mutation
  "refine_document_section",
  "regenerate_document_page",
  "enhance_document_prompt",
  // Documents — deploy / export
  "deploy_document", "unpublish_document",
  "export_document",
  "get_document_pdf",
  // Documents — special-purpose
  "structured_doc",
  "create_tournament_schedule",
  "edit_tournament_schedule",
  // Templates (Canva Autofill equivalent)
  "fill_template",
  "get_template_slots",
  // Import / discovery
  "import_html",
  "search_files",
  "list_themes",
  // Images
  "generate_image", "transform_image",
  "optimize_image",
  "pdf_to_images",
  // Video
  "video_create", "list_videos",
  "avatar_video_create",
  "generate_captions", "get_caption_status",
  "character_remember", "character_list", "character_delete",
  // Voice
  "voice_tts_create",
  // Research
  "research_scrape", "research_search",
  // Image
  "image_generate",
  // Brand
  "list_brand_kits", "get_default_brand_kit", "extract_brand_kit_from_url",
  "create_brand_kit", "update_brand_kit", "delete_brand_kit",
  // File IO (needed to retrieve generated assets / PDF URLs)
  "list_files", "get_file", "upload_file",
  // Share links — magic links to documents/landings with granular permissions
  "create_share_link", "list_share_links", "revoke_share_link",
  // Vision-based document cloning / reimagining
  "clone_document",
  // Document transforms (chat-style editing)
  "apply_brand_kit", "change_document_format", "wait_for_document",
]);

export const CORE_ALLOWLIST = new Set<string>([
  "list_files", "get_file", "upload_file",
  "db_list", "db_create", "db_query",
  "list_documents", "get_document", "create_document", "update_document", "delete_document",
  "open_design_in_editor",
  "set_page_html", "get_page_html", "add_page", "delete_page", "reorder_pages", "deploy_document",
  "export_document",
  "create_quotation",
  "edit_quotation",
  "fast_quotation",
  "fast_pdf",
  "edit_fast_pdf",
  "structured_doc",
  "create_tournament_schedule",
  "edit_tournament_schedule",
  "get_usage_stats",
  "create_form",
  "list_forms",
  "list_form_submissions",
  "deploy_website_file",
  "upload_website_file",
  "list_website_files",
  "inject_html",
  "list_websites",
  "create_website",
  "delete_website",
  "transform_image",
  "generate_image",
  "video_create", "list_videos",
  "avatar_video_create",
  "generate_captions", "get_caption_status",
  "voice_tts_create",
  "research_scrape", "research_search",
  "image_generate",
  "character_remember", "character_list", "character_delete",
  "get_default_brand_kit", "list_brand_kits", "extract_brand_kit_from_url",
  "create_brand_kit", "update_brand_kit", "delete_brand_kit",
  "create_share_link", "list_share_links", "revoke_share_link",
  "clone_document",
  "apply_brand_kit", "change_document_format", "wait_for_document",
]);

/** Video toolset — video_create + character CRUD + list, plus get_file to retrieve the finished mp4. */
export const VIDEO_ALLOWLIST = new Set<string>([
  "video_create",
  "list_videos",
  "avatar_video_create",
  "generate_captions", "get_caption_status",
  "character_remember",
  "character_list",
  "character_delete",
  "get_file",
  "list_files",
  "upload_file",
]);

/** Avatar toolset — talking-head generation (fal.ai now, HeyGen later). Reuses character store + file IO + voice. */
export const AVATAR_ALLOWLIST = new Set<string>([
  "avatar_video_create",
  "voice_tts_create",
  "character_remember",
  "character_list",
  "character_delete",
  "get_file",
  "list_files",
  "upload_file",
]);

/** Voice toolset — TTS + (future) STT + cloning. */
export const VOICE_ALLOWLIST = new Set<string>([
  "voice_tts_create",
  "get_file",
  "list_files",
  "upload_file",
]);

/** Research toolset — Brightdata Web Unlocker + SERP API. */
export const RESEARCH_ALLOWLIST = new Set<string>([
  "research_scrape",
  "research_search",
  "list_files",
  "upload_file",
]);

/** Image toolset — fal.ai Flux generation + (future) transforms. */
export const IMAGE_ALLOWLIST = new Set<string>([
  "image_generate",
  "transform_image",
  "get_file",
  "list_files",
  "upload_file",
]);

export const MAGNET_ALLOWLIST = new Set<string>([
  "create_lead_magnet",
  "create_document", "set_page_html", "get_page_html",
  "create_website", "deploy_website_file",
  "list_websites", "list_website_files",
  "upload_website_file",
  "create_form", "inject_html",
  "list_forms",
  "upload_file", "get_file",
  "transform_image",
  "list_form_submissions",
  "get_default_brand_kit", "list_brand_kits",
]);

/** Sandbox toolset — Firecracker microVMs para harness de agentes. */
export const SANDBOX_ALLOWLIST = new Set<string>([
  "sandbox_create",
  "sandbox_list",
  "sandbox_status",
  "sandbox_destroy",
  "sandbox_exec",
  "sandbox_run_code",
  "sandbox_files_write",
  "sandbox_files_read",
  "sandbox_files_list",
  "agent_run",
  "agent_run_status",
  "agent_run_destroy",
]);

/**
 * Map of group key → allowlist. Groups without an entry load the full tool
 * set of their registered categories (no name-level filtering).
 */
export const GROUP_ALLOWLISTS: Partial<Record<ToolGroupKey, Set<string>>> = {
  core: CORE_ALLOWLIST,
  design: DESIGN_ALLOWLIST,
  magnet: MAGNET_ALLOWLIST,
  video: VIDEO_ALLOWLIST,
  sandbox: SANDBOX_ALLOWLIST,
};
