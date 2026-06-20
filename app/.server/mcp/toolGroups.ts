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
  | "ghosty"
  | "design"
  | "docs"
  | "sites"
  | "brand"
  | "magnet"
  | "video"
  | "sandbox"
  | "hosting"
  | "payments"
  | "email"
  | "public-safe"
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
    toolCount: 43,
  },
  {
    key: "core",
    label: "Core",
    description: "Lo esencial: archivos, DBs, documentos, forms, websites, brand. Para agentes generalistas.",
    toolCount: 42,
  },
  {
    key: "ghosty",
    label: "Ghosty",
    description: "Curado y mínimo para agentes Ghosty (DeepSeek): set DB completo + documentos + archivos + imagen (gpt-image-2). Sin brand/forms/websites/media para no floodear la elección de tool.",
    toolCount: 25,
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
    description: "MicroVMs Firecracker para correr agentes y código aislado. Ciclo de vida (spawn/extend/suspend/resume/destroy), exec (sync + background), run-code, kernel Jupyter persistente (run_cell con estado + charts), archivos (write/read/list/delete/move/mkdir), expose_port (URL pública) + agent_run (Claude managed con billing por token). Ideal para harness de agentes (Claude Code, Codex) y ejecución segura.",
    toolCount: 22,
  },
  {
    key: "hosting",
    label: "Hosting",
    description:
      "Máquinas permanentes (VM always-on) sobre Firecracker: tiers fijos en MXN/mes (nano…performance), crear/listar/destruir. El plan da acceso; cada máquina factura flat al mes. Ideal para hostear apps, bots y servicios persistentes.",
    toolCount: 5,
  },
  {
    key: "payments",
    label: "Payments",
    description:
      "Links de pago con MercadoPago (BYO): conecta tu cuenta y genera cobros. El dinero va directo a tu MP; EasyBits no retiene fondos. Ideal para que un agente cierre la venta.",
    toolCount: 2,
  },
  {
    key: "email",
    label: "Email & Broadcasts",
    description:
      "Email transaccional + audiencia + newsletters one-shot. send_email, contactos con tags, y broadcasts con unsubscribe automático. La capa de nurturing del funnel.",
    toolCount: 6,
  },
  {
    key: "public-safe",
    label: "Public Safe",
    description: "Subset mínimo para agentes públicos (B2C / WhatsApp customer-facing): upload_file, create_share_link, db_select (read-only SQL con anti-stacking, anti-CROSS-JOIN, anti-sqlite_master). Sin listar workspace, sin eliminar, sin webhooks/websites/secrets, sin internet abierto. Diseñado para NanoClaw FORMMY_PUBLIC_TEMPLATE.",
    toolCount: 3,
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
  "create_or_edit_image", "transform_image",
  "optimize_image",
  "edit_image",
  "describe_image",
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
  // "image_generate", // DESACTIVADA hasta nuevo aviso (fal.ai sin saldo)
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
  "create_or_edit_image",
  "edit_image",
  "describe_image",
  "video_create", "list_videos",
  "avatar_video_create",
  "generate_captions", "get_caption_status",
  "voice_tts_create",
  "research_scrape", "research_search",
  // "image_generate", // DESACTIVADA hasta nuevo aviso (fal.ai sin saldo)
  "character_remember", "character_list", "character_delete",
  "get_default_brand_kit", "list_brand_kits", "extract_brand_kit_from_url",
  "create_brand_kit", "update_brand_kit", "delete_brand_kit",
  "create_share_link", "list_share_links", "revoke_share_link",
  "clone_document",
  "apply_brand_kit", "change_document_format", "wait_for_document",
  "secret_set", "secret_list", "secret_delete",
]);

/**
 * Ghosty toolset — superficie curada y mínima para agentes ghosty.studio
 * (DeepSeek vía CodeWhale): con 140 tools pierden confiabilidad eligiendo tool.
 * Set explícito (NO hereda de CORE) para mantenerlo lean: el set DB completo +
 * documentos + archivos + 1 tool de imagen (OpenAI gpt-image-2). Deliberadamente
 * SIN brand kits, forms, share links, websites, research, secrets, ni media/
 * video/voz/tournament — se añaden uno a uno si un caso real lo justifica.
 */
export const GHOSTY_ALLOWLIST = new Set<string>([
  // DB — set completo (el punto del grupo)
  "db_create", "db_query", "db_select", "db_exec",
  "db_import", "db_list", "db_get", "db_delete",
  // Documentos
  "create_document", "get_document", "list_documents", "update_document", "delete_document",
  "add_page", "delete_page", "reorder_pages",
  "set_page_html", "get_page_html",
  "deploy_document", "open_design_in_editor",
  // Export a PDF (entrega de archivos): sin esto el agente solo tiene el link web (/s/),
  // no puede traer un PDF real. get_document_pdf → URL del PDF; export_document → idem por formato.
  "export_document", "get_document_pdf",
  // Archivos
  "list_files", "get_file", "upload_file",
  // Imagen — OpenAI gpt-image-2 (text-to-image + edición por referencia)
  "create_or_edit_image",
  // Vision — describir/OCR de imágenes (screenshots, fotos) barato (1 cr)
  "describe_image",
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

/** Image toolset — fal.ai Flux generation + Gemini Nano Banana 2 edit + transforms. */
export const IMAGE_ALLOWLIST = new Set<string>([
  // "image_generate", // DESACTIVADA hasta nuevo aviso (fal.ai sin saldo)
  "edit_image",
  "describe_image",
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
  "sandbox_extend",
  "sandbox_suspend",
  "sandbox_resume",
  "sandbox_exec",
  "sandbox_run_code",
  "sandbox_files_write",
  "sandbox_files_read",
  "sandbox_files_list",
  "sandbox_files_delete",
  "sandbox_files_move",
  "sandbox_files_mkdir",
  "sandbox_expose_port",
  "sandbox_domain_add",
  "sandbox_domain_remove",
  "sandbox_domain_list",
  "sandbox_domain_verify",
  "sandbox_exec_background",
  "sandbox_exec_status",
  "sandbox_exec_kill",
  "sandbox_run_cell",
  "sandbox_kernel_restart",
  "agent_run",
  "agent_run_status",
  "agent_run_destroy",
  "templates_list",
  "agent_create",
  "agent_message",
  "agent_list",
  "agent_install_skill",
  "agent_record",
  "agent_recording_start",
  "agent_recording_stop",
  "agent_recording_list",
  "studio_create_room",
  "studio_start_recording",
  "studio_stop_recording",
  "studio_list_recordings",
  "ghosty_spawn",
  "goose_spawn",
]);

/**
 * Hosting — always-on machines (máquinas permanentes). MVP surface:
 * catalog + create/list/get/destroy. resize_machine / add_machine_disk join
 * once the host contract (reserved CPU floor, live resize) lands.
 */
export const HOSTING_ALLOWLIST = new Set<string>([
  "list_machine_tiers",
  "create_machine",
  "make_permanent",
  "list_machines",
  "release_machine",
]);

/** Payments toolset — MercadoPago BYO payment links. */
export const PAYMENTS_ALLOWLIST = new Set<string>([
  "create_payment_link",
  "list_payment_links",
]);

/**
 * Email toolset — transactional send + audience + broadcasts. Includes
 * create_payment_link so an agent can nurture and sell in one flow.
 */
export const EMAIL_ALLOWLIST = new Set<string>([
  "send_email",
  "add_contact",
  "list_contacts",
  "create_broadcast",
  "send_broadcast",
  "list_broadcasts",
  "create_payment_link",
]);

/**
 * Public-safe toolset — minimal surface for B2C / WhatsApp customer-facing
 * agents. Just 3 tools: store a user's attachment, mint a share link for it,
 * and query a known catalog DB read-only. db_select is hard-locked to
 * SELECT-only with anti-stacking, anti-cross-join, anti-schema-enumeration
 * guards (see server.ts:db_select).
 *
 * Deliberately excludes: list_files, db_list (workspace enumeration);
 * db_query (full SQL access); get_file (would need explicit per-tenant
 * file ID injection — easy to expand later); generate_image, voice_tts_create
 * (cost vectors — enable per-tenant via override when paid use case warrants);
 * every delete_* / update_* (destructive); webhooks / websites / secrets
 * (admin surface); research_search / research_scrape (open internet).
 *
 * To grant a specific tenant more reach, override container_config.env in
 * NanoClaw — don't expand this default set.
 */
export const PUBLIC_SAFE_ALLOWLIST = new Set<string>([
  "upload_file",
  "create_share_link",
  "db_select",
]);

/**
 * Dynamic-only tools — registradas (así `discover_tools`/`run_tool` las siguen
 * alcanzando) pero ocultas de `tools/list` en TODOS los grupos, incluido `all`
 * y los grupos sin allowlist (`docs`/`sites`/`brand`). Son tools redundantes o
 * legacy que conservamos por compatibilidad pero que no queremos floodeando el
 * selector de tool de ningún agente. NO se borran — se degradan a la vía
 * dinámica. server.ts las deshabilita incondicionalmente tras el allowlist.
 */
export const DYNAMIC_ONLY_TOOLS = new Set<string>([
  // Sistema viejo de share-token — superado por create/list/revoke_share_link
  "generate_share_token", "list_share_tokens", "revoke_share_token",
  "list_permissions", "revoke_permission",
  // Duplicados exactos de tools más nuevas
  "extract_brand_kit", // → extract_brand_kit_from_url
  "get_docs",          // → get_document / list_documents
  "generate_document", // → create_document (path streaming)
]);

/**
 * Map of group key → allowlist. Groups without an entry load the full tool
 * set of their registered categories (no name-level filtering).
 */
export const GROUP_ALLOWLISTS: Partial<Record<ToolGroupKey, Set<string>>> = {
  core: CORE_ALLOWLIST,
  ghosty: GHOSTY_ALLOWLIST,
  design: DESIGN_ALLOWLIST,
  magnet: MAGNET_ALLOWLIST,
  video: VIDEO_ALLOWLIST,
  sandbox: SANDBOX_ALLOWLIST,
  hosting: HOSTING_ALLOWLIST,
  payments: PAYMENTS_ALLOWLIST,
  email: EMAIL_ALLOWLIST,
  "public-safe": PUBLIC_SAFE_ALLOWLIST,
};
