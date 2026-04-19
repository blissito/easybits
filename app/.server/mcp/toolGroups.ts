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
  | "slides"
  | "sites"
  | "brand"
  | "magnet"
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
      "Canva-like: documentos, presentaciones, brand kits e imágenes. Ideal para Claude.ai / Claude Design.",
    recommended: true,
    toolCount: 24,
  },
  {
    key: "core",
    label: "Core",
    description: "Lo esencial: archivos, DBs, documentos, forms, websites, brand. Para agentes generalistas.",
    toolCount: 40,
  },
  {
    key: "docs",
    label: "Documents",
    description: "Solo tools de documentos (create/update/deploy + quotations + structured_doc).",
  },
  {
    key: "slides",
    label: "Presentations",
    description: "Solo tools de presentaciones (crear, editar, deployar slides).",
  },
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
  // Documents
  "list_documents", "get_document",
  "create_document", "update_document", "delete_document",
  "set_page_html", "get_page_html",
  "add_page", "delete_page", "reorder_pages",
  "deploy_document",
  "structured_doc",
  // Presentations
  "list_presentations", "get_presentation",
  "create_presentation", "update_presentation", "delete_presentation",
  "deploy_presentation", "unpublish_presentation",
  // Images
  "generate_image", "transform_image",
  // Brand
  "list_brand_kits", "get_default_brand_kit", "extract_brand_kit_from_url",
  "create_brand_kit", "update_brand_kit", "delete_brand_kit",
  // File IO (needed to retrieve generated assets / PDF URLs)
  "list_files", "get_file", "upload_file",
]);

export const CORE_ALLOWLIST = new Set<string>([
  "list_files", "get_file", "upload_file",
  "db_list", "db_create", "db_query",
  "list_documents", "get_document", "create_document", "update_document", "delete_document",
  "set_page_html", "get_page_html", "add_page", "delete_page", "reorder_pages", "deploy_document",
  "create_quotation",
  "edit_quotation",
  "fast_quotation",
  "fast_pdf",
  "edit_fast_pdf",
  "structured_doc",
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
  "get_default_brand_kit", "list_brand_kits", "extract_brand_kit_from_url",
  "create_brand_kit", "update_brand_kit", "delete_brand_kit",
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

/**
 * Map of group key → allowlist. Groups without an entry load the full tool
 * set of their registered categories (no name-level filtering).
 */
export const GROUP_ALLOWLISTS: Partial<Record<ToolGroupKey, Set<string>>> = {
  core: CORE_ALLOWLIST,
  design: DESIGN_ALLOWLIST,
  magnet: MAGNET_ALLOWLIST,
};
