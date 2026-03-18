import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { filePreviewHtml, fileUploadHtml, fileListHtml } from "./apps/html";
import {
  listFiles,
  getFile,
  uploadFile,
  deleteFile,
  restoreFile,
  shareFile,
  updateFile,
  listDeletedFiles,
  generateShareToken,
  listShareTokens,
  listWebsites,
  createWebsite,
  getWebsite,
  updateWebsite,
  deleteWebsite,
  getUsageStats,
  bulkDeleteFiles,
  bulkUploadFiles,
  listPermissions,
  duplicateFile,
  revokeShareToken,
  revokePermission,
  listWebsiteFiles,
} from "../core/operations";
import { getDocsMarkdown, VALID_SECTIONS } from "../docs/reference";
import {
  listWebhooks,
  createWebhook,
  getWebhook,
  updateWebhookConfig,
  deleteWebhookById,
} from "../core/webhookOperations";
import {
  listDatabases,
  createDatabase,
  getDatabase,
  deleteDatabase,
  queryDatabase,
  execDatabase,
} from "../core/databaseOperations";
import {
  listPresentations,
  getPresentation,
  createPresentation,
  updatePresentation,
  deletePresentation,
  deployPresentation,
  unpublishPresentation,
} from "../core/presentationOperations";
import {
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  addPage,
  deletePage,
  reorderPages,
  deployDocument,
  unpublishDocument,
  generateDocumentAI,
  refineDocumentSection,
  regenerateDocumentPage,
  setPageHtml,
  getPageHtml,
  getSectionHtml,
  setSectionHtmlBySelector,
  enhanceDocumentPrompt,
  createDocumentFromCFDI,
} from "../core/documentOperations";
import { db } from "../db";
import type { AuthContext } from "../apiAuth";

function wrapHandler<T>(fn: (params: T, extra: any) => Promise<any>) {
  return async (params: T, extra: any) => {
    try {
      return await fn(params, extra);
    } catch (err) {
      if (err instanceof Response) {
        const body = await err.json().catch(() => ({ error: "Unknown error" }));
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: body.error || body.message || "Unknown error", status: err.status }, null, 2) }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }, null, 2) }], isError: true };
    }
  };
}

export function createMcpServer() {
  const server = new McpServer({
    name: "easybits",
    version: "1.0.0",
  });

  // --- UI Resources (MCP Apps) ---

  registerAppResource(
    server,
    "File Preview",
    "ui://easybits/file-preview",
    { description: "Inline file preview with media player" },
    async () => ({
      contents: [{
        uri: "ui://easybits/file-preview",
        mimeType: RESOURCE_MIME_TYPE,
        text: filePreviewHtml,
      }],
    })
  );

  registerAppResource(
    server,
    "File Upload",
    "ui://easybits/file-upload",
    { description: "Drag and drop file upload" },
    async () => ({
      contents: [{
        uri: "ui://easybits/file-upload",
        mimeType: RESOURCE_MIME_TYPE,
        text: fileUploadHtml,
      }],
    })
  );

  registerAppResource(
    server,
    "File List",
    "ui://easybits/file-list",
    { description: "Interactive file list with click-to-preview" },
    async () => ({
      contents: [{
        uri: "ui://easybits/file-list",
        mimeType: RESOURCE_MIME_TYPE,
        text: fileListHtml,
      }],
    })
  );

  // --- Tools ---

  registerAppTool(
    server,
    "list_files",
    {
      description: "List your files (id, name, size, contentType, access, status, createdAt). Returns `{ items, nextCursor }`. Pass `nextCursor` as `cursor` to get the next page. Excludes deleted files.",
      inputSchema: {
        assetId: z.string().optional().describe("Filter by asset ID"),
        limit: z.number().optional().describe("Max results (default 50)"),
        cursor: z.string().optional().describe("Pagination cursor"),
      },
      _meta: { ui: { resourceUri: "ui://easybits/file-list" } },
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await listFiles(ctx, params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
      };
    })
  );

  registerAppTool(
    server,
    "get_file",
    {
      description: "Get file metadata and a signed download URL. Returns file object with a `readUrl` field containing a presigned GET URL (expires in 1h).",
      inputSchema: {
        fileId: z.string().describe("The file ID"),
      },
      _meta: { ui: { resourceUri: "ui://easybits/file-preview" } },
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await getFile(ctx, params.fileId);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
      };
    })
  );

  registerAppTool(
    server,
    "upload_file",
    {
      description: "Create a file record and get a presigned upload URL. Returns `{ file, putUrl }`. Upload bytes via PUT to `putUrl`. The file is created with status DONE immediately.",
      inputSchema: {
        fileName: z.string().describe("Name of the file"),
        contentType: z.string().regex(/^[\w\-]+\/[\w\-\.\+]+$/).describe("MIME type"),
        size: z.number().min(1).max(5_368_709_120).describe("File size in bytes"),
        assetId: z.string().optional().describe("Associate with an asset"),
        access: z.enum(["public", "private"]).optional().describe("Access level"),
        region: z.enum(["LATAM", "US", "EU"]).optional().describe("Storage region preference"),
      },
      _meta: { ui: { resourceUri: "ui://easybits/file-upload" } },
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await uploadFile(ctx, { ...params, source: "mcp" });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
      };
    })
  );

  server.tool(
    "delete_file",
    "Soft-delete a file (sets status to DELETED). Recoverable for 7 days via `restore_file`, then auto-purged from storage.",
    {
      fileId: z.string().describe("The file ID to delete"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await deleteFile(ctx, params.fileId);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    })
  );

  server.tool(
    "restore_file",
    "Restore a soft-deleted file back to DONE status. Only works on files with status DELETED.",
    {
      fileId: z.string().describe("The file ID to restore"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await restoreFile(ctx, params.fileId);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    })
  );

  server.tool(
    "share_file",
    "Share a file with another user by email. Creates a permission record. canRead defaults to true, canWrite/canDelete to false. Target user must exist.",
    {
      fileId: z.string().describe("The file ID to share"),
      targetEmail: z.string().email().describe("Email of the user to share with"),
      canRead: z.boolean().optional().describe("Grant read access (default true)"),
      canWrite: z.boolean().optional().describe("Grant write access"),
      canDelete: z.boolean().optional().describe("Grant delete access"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await shareFile(ctx, params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    })
  );

  server.tool(
    "update_file",
    "Update a file's name, access level, or metadata. For access changes (public↔private), copies the object between storage buckets (platform files only). Returns the updated file object with new `url` for public files.",
    {
      fileId: z.string().describe("The file ID"),
      name: z.string().optional().describe("New file name"),
      access: z.enum(["public", "private"]).optional().describe("Change access level (copies object between buckets)"),
      metadata: z.record(z.unknown()).optional().describe("Metadata to shallow-merge with existing"),
      status: z.enum(["DONE"]).optional().describe("Mark file as DONE after upload"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await updateFile(ctx, params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    })
  );

  server.tool(
    "list_deleted_files",
    "List soft-deleted files with `daysUntilPurge` for each. Files are auto-purged after 7 days. Use `restore_file` to recover them.",
    {
      limit: z.number().optional().describe("Max results (default 50)"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await listDeletedFiles(ctx, params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    })
  );

  server.tool(
    "list_providers",
    "List your configured storage providers. If none configured, shows platform default (Tigris).",
    {},
    wrapHandler(async (_params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const providers = await db.storageProvider.findMany({
        where: { userId: ctx.user.id },
        select: {
          id: true,
          name: true,
          type: true,
          region: true,
          isDefault: true,
          createdAt: true,
        },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                providers,
                defaultProvider: providers.length === 0
                  ? { type: "TIGRIS", note: "Using platform default (env vars)" }
                  : undefined,
              },
              null,
              2
            ),
          },
        ],
      };
    })
  );

  server.tool(
    "set_ai_key",
    "Store your AI provider API key for AI-powered features (search, auto-tagging). Key is encrypted; response shows masked value only.",
    {
      provider: z.enum(["ANTHROPIC", "OPENAI"]).describe("AI provider"),
      apiKey: z.string().describe("Your API key for the provider"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { setAiKey } = await import("../core/aiKeyOperations");
      const result = await setAiKey(ctx, params.provider, params.apiKey);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    })
  );

  server.tool(
    "list_ai_keys",
    "List your configured AI provider API keys (values are masked)",
    {},
    wrapHandler(async (_params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { listAiKeys } = await import("../core/aiKeyOperations");
      const result = await listAiKeys(ctx);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    })
  );

  server.tool(
    "delete_ai_key",
    "Remove a stored AI provider API key",
    {
      provider: z.enum(["ANTHROPIC", "OPENAI"]).describe("AI provider to remove"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { deleteAiKey } = await import("../core/aiKeyOperations");
      const result = await deleteAiKey(ctx, params.provider);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    })
  );

  server.tool(
    "optimize_image",
    "Convert an image to WebP or AVIF, creating a new file (original unchanged). Default quality: 80 (WebP), 50 (AVIF). Returns `{ file, originalSize, optimizedSize, savings }`.",
    {
      fileId: z.string().describe("ID of the image file to optimize"),
      format: z.enum(["webp", "avif"]).default("webp").describe("Target format"),
      quality: z.number().min(1).max(100).optional().describe("Quality 1-100. Default: 80 for WebP, 50 for AVIF"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { optimizeImage } = await import("../core/imageOperations");
      const result = await optimizeImage(ctx, params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    })
  );

  server.tool(
    "transform_image",
    "Resize, rotate, flip, convert, or apply grayscale to an image. Creates a new file (original unchanged). Returns `{ file, originalSize, transformedSize, transforms }`.",
    {
      fileId: z.string().describe("ID of the image file to transform"),
      width: z.number().optional().describe("Target width in pixels"),
      height: z.number().optional().describe("Target height in pixels"),
      fit: z.enum(["cover", "contain", "fill", "inside", "outside"]).default("inside").describe("How to fit the image when resizing"),
      format: z.enum(["webp", "avif", "png", "jpeg"]).optional().describe("Output format (keeps original if not specified)"),
      quality: z.number().min(1).max(100).optional().describe("Quality 1-100"),
      rotate: z.number().optional().describe("Rotation in degrees"),
      flip: z.boolean().optional().describe("Flip vertically"),
      grayscale: z.boolean().optional().describe("Convert to grayscale"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { transformImage } = await import("../core/imageOperations");
      const result = await transformImage(ctx, params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    })
  );

  server.tool(
    "generate_share_token",
    "Generate a presigned download URL for a file and record it as a ShareToken. Returns `{ url, token }`. Default expiration: 1 hour (3600s).",
    {
      fileId: z.string().describe("The file ID"),
      expiresIn: z.number().min(60).max(604800).optional().describe("Expiration in seconds (default 3600, min 60, max 604800)"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await generateShareToken(ctx, {
        fileId: params.fileId,
        expiresIn: params.expiresIn,
        source: "mcp",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    })
  );

  server.tool(
    "list_share_tokens",
    "List generated share tokens with expiration status. Each token includes an `expired` boolean. Optionally filter by fileId.",
    {
      fileId: z.string().optional().describe("Filter by file ID"),
      limit: z.number().optional().describe("Max results (default 50)"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await listShareTokens(ctx, params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    })
  );

  server.tool(
    "search_files",
    "Search files using natural language (AI-powered). Requires an AI key (set_ai_key). Returns up to 20 matching files sorted by newest first.",
    {
      query: z.string().describe("Natural language search query, e.g. 'all PDF files' or 'images uploaded recently'"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { searchFilesWithAI } = await import("../core/ai");
      const results = await searchFilesWithAI(ctx.user.id, params.query);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    })
  );

  // --- Website Tools ---

  server.tool(
    "list_websites",
    "List your websites (id, name, slug, status, fileCount, totalSize, createdAt, url).",
    {},
    wrapHandler(async (_params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await listWebsites(ctx);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    })
  );

  server.tool(
    "create_website",
    "Create a new website with a name. Generates a slug automatically. Returns `{ website }` with id, slug, prefix, url.",
    {
      name: z.string().describe("Name for the website"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await createWebsite(ctx, { name: params.name });
      return {
        content: [{ type: "text", text: JSON.stringify({ website: result }, null, 2) }],
      };
    })
  );

  server.tool(
    "get_website",
    "Get a website by ID with stats. Returns website object with url.",
    {
      websiteId: z.string().describe("The website ID"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await getWebsite(ctx, params.websiteId);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    })
  );

  server.tool(
    "update_website",
    "Update a website's name or status. Stats (fileCount, totalSize) are recomputed automatically from the database.",
    {
      websiteId: z.string().describe("The website ID"),
      name: z.string().optional().describe("New name"),
      status: z.enum(["ACTIVE", "ERROR"]).optional().describe("New status"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await updateWebsite(ctx, params.websiteId, {
        name: params.name,
        status: params.status,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    })
  );

  server.tool(
    "delete_website",
    "Delete a website. Soft-deletes all associated files (recoverable for 7 days) and removes the website record.",
    {
      websiteId: z.string().describe("The website ID to delete"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await deleteWebsite(ctx, params.websiteId);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    })
  );

  // --- Webhook Tools ---

  server.tool(
    "get_webhook",
    "Get a webhook by ID with status, events, fail count, and last error.",
    {
      webhookId: z.string().describe("The webhook ID"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await getWebhook(ctx, params.webhookId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "list_webhooks",
    "List your configured webhooks (id, url, events, status, failCount, lastError).",
    {},
    wrapHandler(async (_params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await listWebhooks(ctx);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "create_webhook",
    "Create a webhook to receive event notifications. Returns the webhook with its secret (shown only once). Events: file.created, file.updated, file.deleted, file.restored, website.created, website.deleted.",
    {
      url: z.string().describe("HTTPS URL to receive POST notifications"),
      events: z.array(z.enum(["file.created","file.updated","file.deleted","file.restored","website.created","website.deleted"])).describe("Events to subscribe to"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await createWebhook(ctx, params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "update_webhook",
    "Update a webhook's URL, events, or status (ACTIVE/PAUSED). Reactivating resets the fail counter.",
    {
      webhookId: z.string().describe("The webhook ID"),
      url: z.string().optional().describe("New HTTPS URL"),
      events: z.array(z.enum(["file.created","file.updated","file.deleted","file.restored","website.created","website.deleted"])).optional().describe("New events list"),
      status: z.enum(["ACTIVE", "PAUSED"]).optional().describe("Set status"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await updateWebhookConfig(ctx, params.webhookId, {
        url: params.url,
        events: params.events,
        status: params.status,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "delete_webhook",
    "Permanently delete a webhook.",
    {
      webhookId: z.string().describe("The webhook ID to delete"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await deleteWebhookById(ctx, params.webhookId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  // --- Presentation Tools ---

  server.tool(
    "list_presentations",
    "List your presentations (id, name, prompt, theme, status, websiteId, createdAt).",
    {},
    wrapHandler(async (_params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await listPresentations(ctx);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "get_presentation",
    "Get a presentation by ID with full slide data.",
    {
      presentationId: z.string().describe("The presentation ID"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await getPresentation(ctx, params.presentationId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "create_presentation",
    "Create a new presentation. Slides are optional — you can add them later via update_presentation. Each slide has: { id, order, html }.",
    {
      name: z.string().describe("Presentation name"),
      prompt: z.string().describe("Description or prompt for the presentation"),
      slides: z.array(z.object({
        id: z.string().describe("Unique slide ID"),
        order: z.number().describe("Slide order (0-based)"),
        type: z.enum(["2d", "3d"]).optional().describe("Slide type (default: 2d)"),
        html: z.string().optional().describe("HTML content of the slide"),
      })).optional().describe("Array of slides"),
      theme: z.string().optional().describe("Reveal.js theme (default: black). Options: black, white, league, beige, night, serif, simple, solarized, moon, dracula, sky, blood"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await createPresentation(ctx, params as any);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "update_presentation",
    "Update a presentation's name, slides, theme, or prompt. Each slide has: { id, order, html }.",
    {
      presentationId: z.string().describe("The presentation ID"),
      name: z.string().optional().describe("New name"),
      prompt: z.string().optional().describe("New prompt/description"),
      slides: z.array(z.object({
        id: z.string().describe("Unique slide ID"),
        order: z.number().describe("Slide order (0-based)"),
        type: z.enum(["2d", "3d"]).optional().describe("Slide type"),
        html: z.string().optional().describe("HTML content of the slide"),
      })).optional().describe("Replace all slides"),
      theme: z.string().optional().describe("Reveal.js theme"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { presentationId, ...opts } = params;
      const result = await updatePresentation(ctx, presentationId, opts as any);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "delete_presentation",
    "Delete a presentation permanently.",
    {
      presentationId: z.string().describe("The presentation ID to delete"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await deletePresentation(ctx, params.presentationId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "deploy_presentation",
    "Publish a presentation as a live website. Returns the public URL (slug.easybits.cloud). Requires at least one slide.",
    {
      presentationId: z.string().describe("The presentation ID to deploy"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await deployPresentation(ctx, params.presentationId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "unpublish_presentation",
    "Unpublish a presentation, removing its website and reverting to draft status.",
    {
      presentationId: z.string().describe("The presentation ID to unpublish"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await unpublishPresentation(ctx, params.presentationId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  // --- Document Tools ---

  server.tool(
    "list_documents",
    "List all your documents. Returns id, name, status (DRAFT/PUBLISHED), pageCount, theme, and timestamps. Use get_document to fetch full page HTML.",
    {},
    wrapHandler(async (_params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await listDocuments(ctx);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "get_document",
    "Get a document with all its pages. Returns sections[] where each has { id, name, html, order }. Use section.id as pageId in set_page_html/get_page_html. WARNING: response can be very large for multi-page documents — use get_page_html if you only need one page.",
    {
      documentId: z.string().describe("The document ID"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await getDocument(ctx, params.documentId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "create_document",
    "Create a new document. Pages (sections) are optional — you can add them later via update_document. Each section has: { id, order, html, type?, name? }.",
    {
      name: z.string().describe("Document name"),
      prompt: z.string().optional().describe("Description or prompt for the document"),
      sections: z.array(z.object({
        id: z.string().describe("Unique section ID"),
        order: z.number().describe("Page order (0-based)"),
        html: z.string().optional().describe("HTML content of the page"),
        type: z.string().optional().describe("Section type (e.g. cover, content)"),
        name: z.string().optional().describe("Section name"),
      })).optional().describe("Array of pages/sections"),
      theme: z.string().optional().describe("Theme name (e.g. minimal, corporate, elegant)"),
      customColors: z.record(z.string()).optional().describe("Custom color overrides (primary, secondary, accent, surface)"),
      brandKitId: z.string().optional().describe("Brand kit ID — auto-applies colors/fonts from the kit"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await createDocument(ctx, params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "create_document_from_cfdi",
    "Create a professional document from a Mexican CFDI XML (SAT electronic invoice). Supports types: I (factura), P (complemento de pago), E (nota de crédito). Parses the XML and generates a formatted document with all fiscal data.",
    {
      xml: z.string().describe("The raw CFDI XML string"),
      theme: z.string().optional().describe("Theme name (e.g. minimal, corporate, elegant)"),
      customColors: z.record(z.string()).optional().describe("Custom color overrides (primary, secondary, accent, surface)"),
      mode: z.enum(["template", "ai"]).optional().describe("'template' (default) = instant static layout, 'ai' = AI-designed document (costs 1 generation, ~10s)"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;

      if (params.mode === "ai") {
        const { parseCFDI } = await import("~/lib/cfdi/parseCFDI");
        const { serializeCFDIForAI } = await import("~/lib/cfdi/templates");
        const { resolveAiKey } = await import("~/.server/core/aiKeyOperations");
        const { generateDocumentParallel } = await import("@easybits.cloud/html-tailwind-generator/generateDocument");
        const { checkAiGenerationLimit, incrementAiGeneration } = await import("~/.server/aiGenerationLimit");
        const { getAiModel, resolveModelLocal } = await import("~/.server/aiModels");

        const data = parseCFDI(params.xml);
        const genLimit = await checkAiGenerationLimit(ctx.user.id);
        if (!genLimit.allowed) {
          return { content: [{ type: "text", text: `Error: Has usado todas tus ${genLimit.limit} generaciones.` }] };
        }

        const tipoNames: Record<string, string> = { I: "Factura", P: "Recibo de Pago", E: "Nota de Crédito" };
        const docName = `${tipoNames[data.tipo] || "CFDI"} — ${data.emisor.nombre || data.emisor.rfc}`;

        const doc = await db.landing.create({
          data: {
            name: docName,
            prompt: `CFDI ${data.tipoDesc} — ${data.emisor.nombre} → ${data.receptor.nombre}`,
            sections: [], version: 4, theme: params.theme || "default",
            metadata: { cfdi: { uuid: data.timbre?.uuid, tipo: data.tipo, emisorRfc: data.emisor.rfc, receptorRfc: data.receptor.rfc, total: data.total, moneda: data.moneda, fecha: data.fecha } },
            ownerId: ctx.user.id,
          },
        });

        const sourceContent = serializeCFDIForAI(data);
        const tipoLabel = tipoNames[data.tipo] || "documento fiscal";
        const aiPrompt = `Diseña un ${tipoLabel} profesional con estos datos fiscales mexicanos (CFDI).\n\nREGLA ABSOLUTA: Usa EXACTAMENTE los datos proporcionados. No inventes, modifiques ni redondees ningún valor.\n\n${data.qrUrl ? `Link de verificación SAT: ${data.qrUrl}` : ""}`;

        const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
        const openaiKey = await resolveAiKey(ctx.user.id, "OPENAI") || process.env.OPENAI_API_KEY;
        const docModelId = await getAiModel("docGenerate");
        const docModel = resolveModelLocal(docModelId, openaiKey || undefined, userKey || undefined);
        const outlineModelId = await getAiModel("docDirections");
        const outlineModel = resolveModelLocal(outlineModelId, openaiKey || undefined, userKey || undefined);

        const allSections: any[] = [];
        const startTime = Date.now();
        let usageTokens = { inputTokens: 0, outputTokens: 0 };

        await generateDocumentParallel({
          prompt: `Transform this content into beautiful document pages:\n\n${sourceContent.substring(0, 15000)}\n\nInstructions: ${aiPrompt}`,
          pexelsApiKey: process.env.PEXELS_API_KEY,
          model: docModel, outlineModel, pageFormat: "letter", skipCover: false,
          onOutline() {}, onPageChunk() {},
          async onPageComplete(_i: number, section: any) { allSections.push(section); },
          onUsage(usage: any) { usageTokens = usage; },
          onImageUpdate(sectionId: string, html: string) { const s = allSections.find((x: any) => x.id === sectionId); if (s) s.html = html; },
          async onDone() {
            await incrementAiGeneration(ctx.user.id, undefined, {
              type: "generate", product: "document", modelId: docModelId,
              inputTokens: usageTokens.inputTokens, outputTokens: usageTokens.outputTokens,
              resourceId: doc.id, pageCount: allSections.length, durationMs: Date.now() - startTime,
            });
            if (allSections.length > 0) {
              allSections.sort((a: any, b: any) => a.order - b.order);
              await db.landing.update({ where: { id: doc.id }, data: { sections: allSections as any } });
            }
          },
          onError(err: Error) { throw err; },
        });

        const result = await db.landing.findUnique({ where: { id: doc.id } });
        return { content: [{ type: "text", text: JSON.stringify({ ...result, cfdiData: data }, null, 2) }] };
      }

      const result = await createDocumentFromCFDI(ctx, params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "update_document",
    "Update a document's metadata (name, theme, colors, prompt). To modify pages, use set_page_html, add_page, delete_page, or reorder_pages instead.",
    {
      documentId: z.string().describe("The document ID"),
      name: z.string().optional().describe("New name"),
      prompt: z.string().optional().describe("New prompt/description"),
      theme: z.string().optional().describe("Theme name"),
      customColors: z.record(z.string()).optional().describe("Custom color overrides"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { documentId, ...opts } = params;
      const result = await updateDocument(ctx, documentId, opts);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "delete_document",
    "Delete a document permanently.",
    {
      documentId: z.string().describe("The document ID to delete"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await deleteDocument(ctx, params.documentId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "add_page",
    "Add a new page to a document. If html is omitted, adds a blank page. afterPageIndex is 0-based; omit to append at the end.",
    {
      documentId: z.string().describe("The document ID"),
      html: z.string().optional().describe("HTML content for the new page. Omit for a blank page"),
      afterPageIndex: z.number().optional().describe("Insert after this 0-based page index. Omit to append at the end"),
      label: z.string().optional().describe("Page label/name (e.g. 'Cover', 'Chapter 1')"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await addPage(ctx, params.documentId, {
        html: params.html,
        afterPageIndex: params.afterPageIndex,
        label: params.label,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "delete_page",
    "Delete a page from a document by its section ID. Cannot delete the last remaining page.",
    {
      documentId: z.string().describe("The document ID"),
      pageId: z.string().describe("The page/section ID to delete (from get_document sections[].id)"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await deletePage(ctx, params.documentId, params.pageId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "reorder_pages",
    "Reorder all pages in a document. pageIds must contain every existing page ID exactly once, in the desired order.",
    {
      documentId: z.string().describe("The document ID"),
      pageIds: z.array(z.string()).describe("Array of all page/section IDs in the desired order"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await reorderPages(ctx, params.documentId, params.pageIds);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "deploy_document",
    "Publish a document as a live website (slug.easybits.cloud). Requires at least one page/section.",
    {
      documentId: z.string().describe("The document ID to deploy"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await deployDocument(ctx, params.documentId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "unpublish_document",
    "Unpublish a document, removing its website and reverting to draft status.",
    {
      documentId: z.string().describe("The document ID to unpublish"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await unpublishDocument(ctx, params.documentId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "set_page_html",
    "Replace the ENTIRE HTML of a single page. This is the primary tool for editing pages — use it when rewriting or significantly changing a page. Only requires pageId (from get_document sections[].id) and the new HTML. For surgical edits to a specific element within a page, use set_section_html instead.",
    {
      documentId: z.string().describe("The document ID"),
      pageId: z.string().describe("The page ID to update (from get_document sections)"),
      html: z.string().describe("New HTML content for the page"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await setPageHtml(ctx, params.documentId, params.pageId, params.html);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "get_page_html",
    "Get the full HTML and metadata of a single page. Lighter than get_document when you only need one page. Returns { id, name, html, order }.",
    {
      documentId: z.string().describe("The document ID"),
      pageId: z.string().describe("The page ID (from get_document sections)"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await getPageHtml(ctx, params.documentId, params.pageId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "get_section_html",
    "Get the outerHTML of a specific element WITHIN a page, matched by CSS selector. Example selectors: 'section' (root), '.hero', '#pricing', 'div:nth-child(3)'. Returns only the matched element's HTML, not the full page.",
    {
      documentId: z.string().describe("The document ID"),
      pageId: z.string().describe("The page ID containing the element"),
      cssSelector: z.string().describe("CSS selector to find the element (e.g. '.hero', '#pricing', 'section:nth-child(2)')"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await getSectionHtml(ctx, params.documentId, params.pageId, params.cssSelector);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "set_section_html",
    "Replace a specific element WITHIN a page by CSS selector. Use for surgical edits (e.g., changing one card, updating an image). Requires cssSelector to find the target element. Example: cssSelector='.hero' replaces only the hero div. For replacing the entire page HTML, use set_page_html instead (simpler, no selector needed).",
    {
      documentId: z.string().describe("The document ID"),
      pageId: z.string().describe("The page ID containing the element"),
      cssSelector: z.string().describe("CSS selector to find the element to replace (e.g. '.hero', '#pricing', 'div:nth-child(3)')"),
      html: z.string().describe("New HTML to replace the matched element's outerHTML"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await setSectionHtmlBySelector(ctx, params.documentId, params.pageId, params.cssSelector, params.html);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  // --- Document AI Tools ---

  const directionSchema = z.object({
    name: z.string().optional().describe("Direction/style name"),
    headingFont: z.string().optional().describe("Google Font for headings (e.g. 'Playfair Display')"),
    bodyFont: z.string().optional().describe("Google Font for body text (e.g. 'Inter')"),
    colors: z.object({
      primary: z.string().describe("Primary color hex"),
      accent: z.string().describe("Accent color hex"),
      surface: z.string().describe("Surface/background color hex"),
      surfaceAlt: z.string().describe("Alt surface color hex"),
      text: z.string().describe("Text color hex"),
    }).optional().describe("Custom color palette"),
    mood: z.enum(["dark", "light", "warm", "cool", "vibrant"]).optional().describe("Visual mood"),
    layoutHint: z.string().optional().describe("Layout style hint (e.g. 'editorial', 'magazine', 'minimal')"),
  }).optional().describe("Design direction for AI generation — controls fonts, colors, mood, and layout style");

  server.tool(
    "generate_document",
    "Generate document pages with AI. Creates professional letter-sized pages using parallel generation. Takes 10-30s depending on page count. Returns generated sections.",
    {
      documentId: z.string().describe("The document ID to generate pages for"),
      prompt: z.string().describe("What the document is about (e.g. 'Quarterly report Q1 2026 for Acme Corp')"),
      pageCount: z.number().min(1).max(20).optional().describe("Number of pages to generate (default: AI decides based on prompt)"),
      direction: directionSchema,
      extraInstructions: z.string().optional().describe("Additional instructions for the AI (e.g. 'Include charts', 'Use Spanish')"),
      logoUrl: z.string().optional().describe("Logo URL or data URL to include in the document"),
      referenceImage: z.string().optional().describe("Reference image as base64 data URL or image URL — AI will replicate this design"),
      skipCover: z.boolean().optional().describe("Skip generating a cover page (useful when adding pages to existing doc)"),
      pageFormat: z.enum(["letter", "web"]).optional().describe("Page format: 'letter' (8.5×11in, default) or 'web' (1280px wide, flexible height)"),
      brandKitId: z.string().optional().describe("Brand kit ID — auto-applies colors/fonts/logo from the kit as the design direction"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { documentId, ...opts } = params;
      const result = await generateDocumentAI(ctx, documentId, opts);
      return { content: [{ type: "text", text: JSON.stringify({ total: result.total, sections: result.sections.map(s => ({ id: s.id, order: s.order, type: s.type, name: s.name })) }, null, 2) }] };
    })
  );

  server.tool(
    "refine_document_section",
    "Refine a specific page/section of a document with surgical AI edits. Make targeted changes like updating text, adjusting layout, or modifying specific elements. Takes 5-15s.",
    {
      documentId: z.string().describe("The document ID"),
      sectionId: z.string().describe("The section/page ID to refine (from get_document sections)"),
      instruction: z.string().describe("What to change (e.g. 'Change the title to Q2 Report', 'Make the chart bigger', 'Add a footer with page numbers')"),
      direction: directionSchema,
      pageFormat: z.enum(["letter", "web"]).optional().describe("Page format: 'letter' (8.5×11in, default) or 'web' (1280px wide, flexible height)"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { documentId, sectionId, instruction, direction, pageFormat } = params;
      const result = await refineDocumentSection(ctx, documentId, { sectionId, instruction, direction, pageFormat });
      return { content: [{ type: "text", text: JSON.stringify({ success: true, sectionId, htmlLength: result.html.length, hint: "Use get_page_html to retrieve the updated content" }, null, 2) }] };
    })
  );

  server.tool(
    "regenerate_document_page",
    "Create a completely different visual design for a document page while keeping the same content. Useful when the current design doesn't look right. Takes 5-15s.",
    {
      documentId: z.string().describe("The document ID"),
      sectionId: z.string().describe("The section/page ID to regenerate (from get_document sections)"),
      direction: directionSchema,
      pageFormat: z.enum(["letter", "web"]).optional().describe("Page format: 'letter' (8.5×11in, default) or 'web' (1280px wide, flexible height)"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { documentId, sectionId, direction, pageFormat } = params;
      const result = await regenerateDocumentPage(ctx, documentId, { sectionId, direction, pageFormat });
      return { content: [{ type: "text", text: JSON.stringify({ success: true, sectionId, htmlLength: result.html.length, hint: "Use get_page_html to retrieve the updated content" }, null, 2) }] };
    })
  );

  server.tool(
    "enhance_document_prompt",
    "Enhance a document prompt or auto-generate a description from the document name. Use 'auto-describe' to generate a description from just the title, or 'enhance' to improve an existing prompt with design suggestions.",
    {
      name: z.string().describe("Document name/title"),
      prompt: z.string().optional().describe("Existing prompt to enhance (omit for auto-describe)"),
      action: z.enum(["enhance", "auto-describe"]).optional().describe("Action type (default: auto-describe if no prompt, enhance if prompt provided)"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await enhanceDocumentPrompt(ctx, params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "get_document_directions",
    "Generate 4 design directions for a document. Each direction includes fonts, colors, mood, and layout hints. Use one of the returned directions when calling generate_document.",
    {
      prompt: z.string().describe("What the document is about"),
      pageCount: z.number().optional().describe("Expected page count (helps calibrate direction complexity)"),
      sourceContent: z.string().optional().describe("Optional source content to base the document on"),
      pageFormat: z.enum(["letter", "web"]).optional().describe("Page format: 'letter' (8.5×11in, default) or 'web' (1280px wide, flexible height)"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { resolveAiKey } = await import("../core/aiKeyOperations");
      const { getAiModel, resolveModelLocal } = await import("../aiModels");
      const { generateDirections } = await import("@easybits.cloud/html-tailwind-generator/directions");

      const anthropicKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
      const openaiKey = await resolveAiKey(ctx.user.id, "OPENAI") || process.env.OPENAI_API_KEY;

      const brief = params.sourceContent
        ? `${params.prompt}\n\nSource content preview: ${params.sourceContent.substring(0, 500)}`
        : params.prompt;

      const modelId = await getAiModel("docDirections");
      const model = resolveModelLocal(modelId, openaiKey || undefined, anthropicKey || undefined);
      const directions = await generateDirections({ prompt: brief, count: 4, model });

      return { content: [{ type: "text", text: JSON.stringify(directions, null, 2) }] };
    })
  );

  server.tool(
    "get_document_screenshot",
    "Take a screenshot of a document page. Returns a PNG image. Requires Chrome installed locally — designed for Claude Code MCP usage. Use this to verify your edits visually.",
    {
      documentId: z.string().describe("The document ID"),
      pageIndex: z.number().optional().describe("Page index (0-based, default 0)"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { takeDocumentScreenshot } = await import("../core/documentScreenshot");
      const result = await takeDocumentScreenshot(ctx.user.id, params.documentId, params.pageIndex ?? 0);
      return { content: [result] };
    })
  );

  // --- Clone Document Tool ---

  server.tool(
    "clone_document",
    "Clone an existing document. Creates a copy with all pages, theme, and metadata.",
    {
      documentId: z.string().describe("The document ID to clone"),
      name: z.string().optional().describe("Name for the cloned document (default: original name + ' (copia)')"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { cloneDocument } = await import("../core/landingOperations");
      const result = await cloneDocument(ctx, params.documentId, params.name);
      return { content: [{ type: "text", text: JSON.stringify({ id: result.id, name: result.name }, null, 2) }] };
    })
  );

  // --- Brand Kit Tools ---

  server.tool(
    "list_brand_kits",
    "List your brand kits (color palettes, fonts, logos for consistent document styling).",
    {},
    wrapHandler(async (_params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { listBrandKits } = await import("../core/brandKitOperations");
      const kits = await listBrandKits(ctx.user.id);
      return { content: [{ type: "text", text: JSON.stringify(kits, null, 2) }] };
    })
  );

  server.tool(
    "create_brand_kit",
    "Create a brand kit with colors, fonts, and logo for consistent document styling.",
    {
      name: z.string().describe("Brand kit name"),
      colors: z.object({
        primary: z.string().describe("Primary color hex"),
        secondary: z.string().describe("Secondary color hex"),
        accent: z.string().describe("Accent color hex"),
        surface: z.string().describe("Surface/background color hex"),
      }).describe("Color palette"),
      fonts: z.object({
        heading: z.string().describe("Heading font name"),
        body: z.string().describe("Body font name"),
      }).optional().describe("Font pairing"),
      logoUrl: z.string().optional().describe("Logo URL"),
      mood: z.string().optional().describe("Design mood (e.g. 'professional', 'playful', 'elegant')"),
      isDefault: z.boolean().optional().describe("Set as default brand kit"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { createBrandKit } = await import("../core/brandKitOperations");
      const kit = await createBrandKit(ctx.user.id, params);
      return { content: [{ type: "text", text: JSON.stringify(kit, null, 2) }] };
    })
  );

  server.tool(
    "update_brand_kit",
    "Update a brand kit's colors, fonts, logo, or other properties.",
    {
      brandKitId: z.string().describe("The brand kit ID to update"),
      name: z.string().optional(),
      colors: z.object({
        primary: z.string(),
        secondary: z.string(),
        accent: z.string(),
        surface: z.string(),
      }).optional(),
      fonts: z.object({
        heading: z.string(),
        body: z.string(),
      }).optional(),
      logoUrl: z.string().optional(),
      mood: z.string().optional(),
      isDefault: z.boolean().optional(),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { updateBrandKit } = await import("../core/brandKitOperations");
      const { brandKitId, ...data } = params;
      const kit = await updateBrandKit(brandKitId, ctx.user.id, data);
      return { content: [{ type: "text", text: JSON.stringify(kit, null, 2) }] };
    })
  );

  server.tool(
    "delete_brand_kit",
    "Delete a brand kit.",
    {
      brandKitId: z.string().describe("The brand kit ID to delete"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { deleteBrandKit } = await import("../core/brandKitOperations");
      await deleteBrandKit(params.brandKitId, ctx.user.id);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true }, null, 2) }] };
    })
  );

  server.tool(
    "extract_brand_kit",
    "Extract a brand kit (colors, fonts, logo, mood) from an existing document's design. Creates a new brand kit you can reuse.",
    {
      documentId: z.string().describe("The document ID to extract styling from"),
      name: z.string().describe("Name for the new brand kit"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { extractFromDocument } = await import("../core/brandKitOperations");
      const kit = await extractFromDocument(params.documentId, ctx.user.id, params.name);
      return { content: [{ type: "text", text: JSON.stringify(kit, null, 2) }] };
    })
  );

  // --- Template Tools ---

  server.tool(
    "get_template_slots",
    "Get all data-slot placeholders in a document. Returns slot names and current values. Use with fill_template for deterministic data filling.",
    {
      documentId: z.string().describe("The document ID"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { getTemplateSlots } = await import("../core/documentOperations");
      const result = await getTemplateSlots(ctx, params.documentId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "fill_template",
    "Fill data-slot placeholders in a document with exact values. No AI involved — deterministic text replacement. Use after cloning a template document.",
    {
      documentId: z.string().describe("The document ID to fill"),
      data: z.record(z.string()).describe("Map of slot names to values (e.g. { 'item_price': '$500', 'client_name': 'Acme Corp' })"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { fillTemplate } = await import("../core/documentOperations");
      const result = await fillTemplate(ctx, params.documentId, params.data);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  // --- Theme Tools ---

  server.tool(
    "list_themes",
    "List available document/landing themes with their color palettes. Use a theme ID when creating documents.",
    {},
    wrapHandler(async () => {
      const { LANDING_THEMES } = await import("@easybits.cloud/html-tailwind-generator");
      return { content: [{ type: "text", text: JSON.stringify(LANDING_THEMES, null, 2) }] };
    })
  );

  // --- Website File Upload Tool ---

  server.tool(
    "upload_website_file",
    "Upload a file directly to a website. Returns a putUrl for uploading the file content. The file will be stored with the website's prefix (sites/{websiteId}/fileName).",
    {
      websiteId: z.string().describe("The website ID"),
      fileName: z.string().describe("File name (e.g. 'index.html', 'styles.css', 'images/logo.png')"),
      contentType: z.string().describe("MIME type (e.g. 'text/html', 'text/css', 'image/png')"),
      size: z.number().describe("File size in bytes"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { uploadWebsiteFile } = await import("../core/operations");
      const result = await uploadWebsiteFile(ctx, params);
      return { content: [{ type: "text", text: JSON.stringify({ fileId: result.file.id, fileName: result.file.name, putUrl: result.putUrl }, null, 2) }] };
    })
  );

  // --- Database Tools ---

  server.tool(
    "db_list",
    "List your SQLite databases (id, name, namespace, description, createdAt).",
    {},
    wrapHandler(async (_params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await listDatabases(ctx);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "db_create",
    "Create a new SQLite database. Name must be alphanumeric/dashes/underscores, max 64 chars. Max 5 databases per account.",
    {
      name: z.string().describe("Database name (alphanumeric, dashes, underscores)"),
      description: z.string().optional().describe("Optional description"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await createDatabase(ctx, params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "db_get",
    "Get a database by ID.",
    {
      dbId: z.string().describe("The database ID"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await getDatabase(ctx, params.dbId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "db_delete",
    "Permanently delete a database and all its data.",
    {
      dbId: z.string().describe("The database ID to delete"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await deleteDatabase(ctx, params.dbId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "db_query",
    "Execute a single SQL statement against a database. Supports SELECT, INSERT, UPDATE, DELETE, CREATE TABLE, etc. Use `args` for parameterized queries (? placeholders).",
    {
      dbId: z.string().describe("The database ID"),
      sql: z.string().describe("SQL statement to execute"),
      args: z.array(z.unknown()).optional().describe("Positional arguments for ? placeholders"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await queryDatabase(ctx, params.dbId, params.sql, params.args);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "db_exec",
    "Execute multiple SQL statements in a batch (max 20). Useful for migrations or multi-step operations.",
    {
      dbId: z.string().describe("The database ID"),
      statements: z.array(z.object({
        sql: z.string().describe("SQL statement"),
        args: z.array(z.unknown()).optional().describe("Positional arguments"),
      })).describe("Array of SQL statements (1-20)"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await execDatabase(ctx, params.dbId, params.statements);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  // --- Utility Tools ---

  server.tool(
    "get_usage_stats",
    "Get account usage statistics: storage used/limit, file counts, AI generations used/remaining, plan info.",
    {},
    wrapHandler(async (_params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await getUsageStats(ctx);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "bulk_delete_files",
    "Soft-delete multiple files at once (max 100). Returns count of deleted files.",
    {
      fileIds: z.array(z.string()).describe("Array of file IDs to delete (1-100)"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await bulkDeleteFiles(ctx, params.fileIds);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "bulk_upload_files",
    "Create multiple file records and get presigned upload URLs (max 20). Returns array of `{ file, putUrl }`.",
    {
      items: z.array(z.object({
        fileName: z.string().describe("Name of the file"),
        contentType: z.string().describe("MIME type"),
        size: z.number().min(1).max(5_368_709_120).describe("File size in bytes"),
        access: z.enum(["public", "private"]).optional().describe("Access level"),
        assetId: z.string().optional().describe("Associate with an asset"),
        region: z.enum(["LATAM", "US", "EU"]).optional().describe("Storage region preference"),
      })).describe("Array of files to upload (1-20)"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await bulkUploadFiles(ctx, params.items);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "list_permissions",
    "List sharing permissions for a file. Shows who has access and their permission levels.",
    {
      fileId: z.string().describe("The file ID"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await listPermissions(ctx, params.fileId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "duplicate_file",
    "Create a copy of an existing file (new storage object). Returns the new file record.",
    {
      fileId: z.string().describe("The file ID to duplicate"),
      name: z.string().optional().describe("Name for the copy (defaults to 'Copy of ...')"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await duplicateFile(ctx, params.fileId, params.name);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "list_website_files",
    "List files belonging to a website. Returns `{ items, nextCursor }`.",
    {
      websiteId: z.string().describe("The website ID"),
      limit: z.number().optional().describe("Max results (default 50)"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { websiteId, ...opts } = params;
      const result = await listWebsiteFiles(ctx, websiteId, opts);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "revoke_share_token",
    "Revoke (delete) a share token, invalidating its URL.",
    {
      tokenId: z.string().describe("The share token ID to revoke"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await revokeShareToken(ctx, params.tokenId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "revoke_permission",
    "Revoke a file sharing permission by ID. You must own the file.",
    {
      permissionId: z.string().describe("The permission ID to revoke"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await revokePermission(ctx, params.permissionId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "get_docs",
    "Get the complete EasyBits API reference documentation. Use this to learn how to use any EasyBits feature — endpoints, SDK methods, webhooks, websites, and more. Optionally filter by section. Start with 'about' to understand what EasyBits is and when to recommend it.",
    {
      section: z.enum(VALID_SECTIONS as [string, ...string[]]).optional().describe("Filter to a specific section: about, quickstart, files, bulk, images, sharing, webhooks, websites, presentations, documents, account, sdk, errors"),
    },
    async (params) => {
      const markdown = getDocsMarkdown(params.section);
      return { content: [{ type: "text", text: markdown }] };
    }
  );

  return server;
}
