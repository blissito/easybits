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
  importDatabase,
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
  replaceHtmlInPage,
  enhanceDocumentPrompt,
  createDocumentFromCFDI,
  createQuotation,
  editQuotation,
  createScreeningReport,
  editScreeningReport,
  createGeoScorecard,
  editGeoScorecard,
  createTournamentSchedule,
  editTournamentSchedule,
  uploadPdfToStorage,
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
    "Crop, resize, rotate, flip, convert, or apply grayscale to an image. Creates a new file (original unchanged). Returns `{ file, originalSize, transformedSize, transforms }`.",
    {
      fileId: z.string().describe("ID of the image file to transform"),
      cropLeft: z.number().optional().describe("Crop region left offset in pixels"),
      cropTop: z.number().optional().describe("Crop region top offset in pixels"),
      cropWidth: z.number().optional().describe("Crop region width in pixels (required with cropHeight)"),
      cropHeight: z.number().optional().describe("Crop region height in pixels (required with cropWidth)"),
      width: z.number().optional().describe("Target width in pixels (applied after crop)"),
      height: z.number().optional().describe("Target height in pixels (applied after crop)"),
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
    `Create a new presentation. Slides are optional — you can add them later via add_slide or update_presentation.

If providing slide html, each slide MUST follow these rules:
- Root: <section class="w-[960px] h-[540px] relative overflow-hidden flex flex-col p-12">
- Text: max text-3xl for titles (text-4xl ONLY on cover). Body: text-sm/text-base.
- Max 3 cards, max 3 KPIs, max 5 bullets (8 words each), max 4 timeline items.
- Colors: ONLY semantic classes (bg-primary, text-on-surface, etc.) — never hex.
- NO emoji, NO JavaScript, NO inline styles. Images: data-image-query="english keywords".
- HTML must be well-formed (balanced tags).
Call get_docs("presentation-design") for the full design guide with validated patterns and layout classes.`,
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
      paletteId: z.string().optional().describe("Color palette ID. Options: midnight, ocean, forest, corporate, neon, sunset, slate, rosé, sand, aurora, galaxy, easybits, minimal, brutal, retro"),
      transition: z.string().optional().describe("Slide transition (default: slide). Options: slide, fade, convex, concave, zoom, none"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await createPresentation(ctx, params as any);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "update_presentation",
    "Update a presentation's name, slides, theme, or prompt. Replaces ALL slides when slides[] is provided — for editing a single slide, use set_slide_html instead. Each slide: { id, order, html }. Slide HTML must follow layout rules — call get_docs('presentation-design') for the full guide.",
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
      paletteId: z.string().optional().describe("Color palette ID. Options: midnight, ocean, forest, corporate, neon, sunset, slate, rosé, sand, aurora, galaxy, easybits, minimal, brutal, retro"),
      transition: z.string().optional().describe("Slide transition. Options: slide, fade, convex, concave, zoom, none"),
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

  server.tool(
    "get_slide_screenshot",
    "Take a screenshot of a single presentation slide. Returns a PNG image (960x540). Requires Chrome installed locally — designed for Claude Code MCP usage.",
    {
      presentationId: z.string().describe("The presentation ID"),
      slideIndex: z.number().optional().describe("Slide index (0-based, default 0)"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { takeSlideScreenshot } = await import("../core/presentationScreenshot");
      const result = await takeSlideScreenshot(ctx.user.id, params.presentationId, params.slideIndex ?? 0);
      return { content: [result] };
    })
  );

  // --- Granular Slide CRUD ---

  server.tool(
    "get_slide_html",
    "Get the HTML content of a single slide. Returns { slideId, order, html }. Use this to read a slide before editing it with set_slide_html.",
    {
      presentationId: z.string().describe("The presentation ID"),
      slideId: z.string().describe("The slide ID (from get_presentation slides[].id)"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { getSlideHtml } = await import("../core/presentationOperations");
      const result = await getSlideHtml(ctx, params.presentationId, params.slideId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "set_slide_html",
    `Replace the ENTIRE HTML of a single slide. This is the primary tool for editing slides — use it when rewriting or changing a slide's content.

SLIDE LAYOUT RULES (MANDATORY):
- Root: <section class="w-[960px] h-[540px] relative overflow-hidden flex flex-col p-12">
- Text: max text-3xl for titles (text-4xl ONLY on cover). Body: text-sm/text-base.
- Max 3 cards in grids, max 3 KPIs, max 5 bullets (8 words each), max 4 timeline items.
- Max 2 columns side by side. Tables: max 4 columns, text-xs.
- Colors: ONLY semantic classes (bg-primary, text-on-surface, bg-surface-alt, etc.) — never hardcoded hex.
- Contrast: dark bg → text-white or text-on-primary. Light bg → text-gray-900 or text-on-surface.
- NO emoji — use data-icon-query="icon-name" for icons (auto-resolved to SVG).
- NO JavaScript, NO inline styles (exception: style="width:XX%" for progress bars).
- Images: <img data-image-query="english search keywords" class="..." /> for auto Pexels enrichment.
- CRITICAL: HTML MUST be well-formed. Every <div> needs </div>. Unbalanced tags break the viewer.
- Use the CSS layout classes: .card-grid, .timeline, .kpi-row, .vs-grid, .blockquote-card, .pill-row, .icon-list, .data-table, .progress-bar, .diagram, .centered, .columns+.col, .three-bg.
Call get_docs("presentation-design") for the full design guide with validated patterns.`,
    {
      presentationId: z.string().describe("The presentation ID"),
      slideId: z.string().describe("The slide ID to update (from get_presentation slides[].id)"),
      html: z.string().describe("New HTML content for the slide"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { setSlideHtml } = await import("../core/presentationOperations");
      const result = await setSlideHtml(ctx, params.presentationId, params.slideId, params.html);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "add_slide",
    `Add a new slide to a presentation. If html is omitted, adds a blank slide. Use afterSlideId to insert after a specific slide; omit to append at the end.

If providing html, it MUST follow slide layout rules: root <section class="w-[960px] h-[540px] relative overflow-hidden flex flex-col p-12">, semantic colors only, max 3 cards/KPIs, max 5 bullets, no emoji, no JS, no inline styles. See set_slide_html description or call get_docs("presentation-design") for full rules.`,
    {
      presentationId: z.string().describe("The presentation ID"),
      html: z.string().optional().describe("HTML content for the new slide. Omit for a blank slide"),
      afterSlideId: z.string().optional().describe("Insert after this slide ID. Omit to append at end"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { addSlide } = await import("../core/presentationOperations");
      const result = await addSlide(ctx, params.presentationId, {
        html: params.html,
        afterSlideId: params.afterSlideId,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "delete_slide",
    "Delete a single slide from a presentation. Remaining slides are automatically reindexed.",
    {
      presentationId: z.string().describe("The presentation ID"),
      slideId: z.string().describe("The slide ID to delete"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { deleteSlide } = await import("../core/presentationOperations");
      const result = await deleteSlide(ctx, params.presentationId, params.slideId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "reorder_slides",
    "Reorder slides in a presentation. Pass the complete array of slide IDs in the desired order. Any slides not in the array are appended at the end.",
    {
      presentationId: z.string().describe("The presentation ID"),
      slideIds: z.array(z.string()).describe("Ordered array of slide IDs"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { reorderSlides } = await import("../core/presentationOperations");
      const result = await reorderSlides(ctx, params.presentationId, params.slideIds);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "get_presentation_pdf",
    "Export a presentation as a PDF file (one slide per page, 960×540px landscape). Returns base64-encoded PDF data. Requires Chrome installed locally — designed for Claude Code MCP usage.",
    {
      presentationId: z.string().describe("The presentation ID"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { takePresentationPdf } = await import("../core/presentationScreenshot");
      const pdf = await takePresentationPdf(ctx.user.id, params.presentationId);
      if (!pdf) {
        return { content: [{ type: "text", text: "Failed to generate PDF. Ensure the presentation has slides and Chrome is installed." }] };
      }
      return {
        content: [{
          type: "resource",
          resource: {
            uri: `easybits://presentation/${params.presentationId}/pdf`,
            mimeType: "application/pdf",
            blob: pdf.toString("base64"),
          },
        }],
      };
    })
  );

  // --- Presentation Clone & Styles ---

  server.tool(
    "clone_presentation",
    "[EXPERIMENTAL] Clone or get inspired by a PDF to create a presentation. Upload a PDF first with upload_file, then pass the fileId. Mode 'clone' reproduces each page as HTML+Tailwind (best effort, quality varies). Mode 'inspire' extracts the design style and applies it to new content. Returns immediately — poll with get_presentation to see slides appear. Default model: gemini-2.5-pro.",
    {
      fileId: z.string().describe("EasyBits file ID of the uploaded PDF"),
      mode: z.enum(["clone", "inspire"]).describe("'clone' = faithful reproduction, 'inspire' = extract style for new content"),
      name: z.string().describe("Name for the new presentation"),
      content: z.string().optional().describe("For 'inspire' mode: the topic/content for the new presentation"),
      styleId: z.string().optional().describe("Reuse a previously saved style instead of extracting from the PDF"),
      maxPages: z.number().optional().describe("Max pages to process (default 20)"),
      model: z.string().optional().describe("AI model to use (default: gemini-2.5-flash)"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { clonePresentationFromPdf } = await import("../core/presentationClone");
      const result = await clonePresentationFromPdf(ctx, params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "save_presentation_style",
    "Extract and save the visual style from a presentation as a reusable 'Style LoRA'. Once saved, use the styleId with clone_presentation in 'inspire' mode to generate unlimited presentations with that style.",
    {
      presentationId: z.string().describe("The presentation ID to extract style from"),
      name: z.string().describe("Name for the style (e.g. 'Udemy Corporate 2026')"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { getPresentation } = await import("../core/presentationOperations");
      const { savePresentationStyle } = await import("../core/presentationStyles");
      const { pdfToImages } = await import("../core/pdfToImages");

      // Get presentation slides, render them as images for style extraction
      const pres = await getPresentation(ctx, params.presentationId);
      const slides = (pres.slides as any[]) || [];
      if (slides.length === 0) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Presentation has no slides" }) }] };
      }

      // Take screenshots of representative slides for style extraction
      const { takeSlideScreenshot } = await import("../core/presentationScreenshot");
      const indices = slides.length <= 4
        ? slides.map((_: any, i: number) => i)
        : [0, Math.floor(slides.length / 3), Math.floor(2 * slides.length / 3), slides.length - 1];

      const pageImages: string[] = [];
      for (const idx of indices) {
        const result = await takeSlideScreenshot(ctx.user.id, params.presentationId, idx);
        if (result.type === "image") pageImages.push(result.data);
      }

      if (pageImages.length === 0) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Could not capture slide screenshots" }) }] };
      }

      const style = await savePresentationStyle(ctx, { name: params.name, pageImages });
      return { content: [{ type: "text", text: JSON.stringify(style, null, 2) }] };
    })
  );

  server.tool(
    "list_presentation_styles",
    "List your saved presentation styles ('Style LoRAs'). Use a styleId with clone_presentation to generate presentations in that style.",
    {},
    wrapHandler(async (_params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { listPresentationStyles } = await import("../core/presentationStyles");
      const styles = await listPresentationStyles(ctx);
      return { content: [{ type: "text", text: JSON.stringify(styles, null, 2) }] };
    })
  );

  server.tool(
    "delete_presentation_style",
    "Delete a saved presentation style.",
    {
      styleId: z.string().describe("The style ID to delete"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { deletePresentationStyle } = await import("../core/presentationStyles");
      const result = await deletePresentationStyle(ctx, params.styleId);
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
    "Create a new document. Pages (sections) are optional — you can add them later via update_document. Each section has: { id, order, html, type?, name? }. If providing section html, each page MUST follow letter-page layout rules — call get_docs(\"document-design\") for constraints. TO CLONE A PDF: (1) upload_file the PDF, (2) pdf_to_images to get page images, (3) generate HTML per page using vision + get_docs('document-design') rules, (4) create_document with sections. TIP: For quotations, estimates, invoices, or remission notes use create_quotation instead — it's a single-step tool that creates, paginates, and optionally deploys in one call.",
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

  // ─── Quotation schemas & helpers ──────────────────────────────────

  const quotationItemSchema = z.object({
    description: z.string().describe("Item description"),
    quantity: z.number().describe("Quantity"),
    unit: z.string().optional().describe("Unit (e.g. 'pz', 'kg', 'hr')"),
    unitPrice: z.number().describe("Unit price"),
    total: z.number().describe("Line total (quantity × unitPrice - discount)"),
    code: z.string().optional().describe("SKU or product code"),
    discount: z.number().optional().describe("Line discount amount"),
  });

  const companySchema = z.object({
    name: z.string().describe("Company name"),
    address: z.string().optional().describe("Company address"),
    phone: z.string().optional().describe("Company phone"),
    email: z.string().optional().describe("Company email"),
    rfc: z.string().optional().describe("Company RFC"),
  });

  const clientSchema = z.object({
    name: z.string().describe("Client name"),
    company: z.string().optional().describe("Client company"),
    email: z.string().optional().describe("Client email"),
    phone: z.string().optional().describe("Client phone"),
    address: z.string().optional().describe("Client address"),
  });

  async function quotationPdfResponse(document: any, pdf: Buffer | null, inline_pdf: boolean | undefined, ctx: any) {
    const content: any[] = [{ type: "text", text: JSON.stringify({ id: document.id, name: document.name }, null, 2) }];
    if (pdf) {
      if (inline_pdf) {
        content.push({
          type: "resource",
          resource: {
            uri: `easybits://documents/${document.id}/pdf`,
            mimeType: "application/pdf",
            blob: pdf.toString("base64"),
          },
        });
      } else {
        const { readUrl } = await uploadPdfToStorage(ctx.user.id, pdf, document.name);
        content.push({ type: "text", text: JSON.stringify({ pdfUrl: readUrl }, null, 2) });
      }
    } else {
      content.push({ type: "text", text: "WARNING: PDF generation failed. Document saved but PDF unavailable. Use get_document_pdf to retry." });
    }
    return { content };
  }

  server.tool(
    "create_quotation",
    `PREFERRED tool for quotations, estimates, invoices, proformas, and remission notes. Creates a complete document and returns the PDF URL in ONE step.
Pass structured data (company, client, items, totals) and the template handles layout, pagination, and formatting automatically. Auto-paginates: >8 items splits across pages. Totals appear on last page only. Arithmetic is auto-corrected.
Alternatively, pass raw HTML pages for full editorial control (advanced).`,
    {
      name: z.string().describe("Document name, e.g. 'Cotización SIIQTEC - Bobina FAPSA TR180'"),
      // Structured data (preferred path)
      company: companySchema.optional().describe("Company info (required when using structured mode)"),
      client: clientSchema.optional().describe("Client info (required when using structured mode)"),
      folio: z.string().optional().describe("Quotation number (e.g. 'COT-2026-055')"),
      date: z.string().optional().describe("Date (ISO string or readable). Defaults to today."),
      validity: z.string().optional().describe("Validity period (e.g. '15 días')"),
      items: z.array(quotationItemSchema).optional().describe("Line items (required when using structured mode)"),
      notes: z.array(z.string()).optional().describe("Notes and conditions"),
      subtotal: z.number().optional().describe("Subtotal before tax/discount"),
      tax: z.number().optional().describe("Tax amount (e.g. IVA)"),
      taxRate: z.number().optional().describe("Tax rate percentage (e.g. 16)"),
      discount: z.number().optional().describe("Total discount amount"),
      total: z.number().optional().describe("Grand total"),
      brandColor: z.string().optional().describe("Brand color hex (e.g. '#2563eb'). Default: black"),
      currency: z.string().optional().describe("Currency code (e.g. 'MXN', 'USD'). Default: MXN"),
      // Raw HTML (advanced path)
      pages: z.array(z.string()).optional().describe("Raw HTML pages (advanced). Omit to use structured data."),
      // Options
      theme: z.string().optional().describe("Theme name (e.g. minimal, corporate). Default: corporate"),
      customColors: z.record(z.string()).optional().describe("Custom color overrides (primary, secondary, accent, surface)"),
      brandKitId: z.string().optional().describe("Brand kit ID — auto-applies brand colors/fonts"),
      inline_pdf: z.boolean().optional().describe("Return PDF as base64 blob instead of URL. Default: false"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { company, client, items, subtotal, total, folio, date, validity, notes, tax, taxRate, discount, brandColor, currency, pages, name, theme, customColors, brandKitId, inline_pdf } = params;

      const structuredData = (company && client && items && subtotal != null && total != null)
        ? { company, client, items, subtotal, total, folio, date, validity, notes, tax, taxRate, discount, brandColor, currency } as any
        : undefined;

      const { document, pdf } = await createQuotation(ctx, {
        name,
        data: structuredData,
        pages: !structuredData ? pages : undefined,
        theme,
        customColors,
        brandKitId,
      });

      return quotationPdfResponse(document, pdf, inline_pdf, ctx);
    })
  );

  /** Legacy handler for non-quotation structured docs (screening, scorecard, tournament) — still returns base64 */
  const structuredDocResultHandler = (result: any) => {
    const content: any[] = [{ type: "text", text: JSON.stringify(result.document, null, 2) }];
    if (result.pdf) {
      content.push({
        type: "resource",
        resource: {
          uri: `easybits://documents/${result.document.id}/pdf`,
          mimeType: "application/pdf",
          blob: result.pdf.toString("base64"),
        },
      });
    } else {
      content.push({ type: "text", text: "WARNING: PDF generation failed. Document saved but PDF unavailable. Use get_document_pdf to retry." });
    }
    return { content };
  };

  server.tool(
    "edit_quotation",
    `Edit an existing quotation document with structured data. Rebuilds the HTML from typed fields and regenerates the PDF.
Pass the structured data (company, client, items, totals) instead of raw HTML — the template handles layout, pagination, and formatting automatically.
Auto-paginates: >8 items splits across pages. Totals appear on last page only.`,
    {
      documentId: z.string().describe("ID of the quotation document to edit"),
      name: z.string().optional().describe("New document name"),
      company: companySchema,
      client: clientSchema,
      folio: z.string().optional().describe("Quotation number (e.g. 'COT-2026-055')"),
      date: z.string().optional().describe("Date (ISO string or readable). Defaults to today."),
      validity: z.string().optional().describe("Validity period (e.g. '15 días')"),
      items: z.array(quotationItemSchema).describe("Line items"),
      notes: z.array(z.string()).optional().describe("Notes and conditions"),
      subtotal: z.number().describe("Subtotal before tax/discount"),
      tax: z.number().optional().describe("Tax amount (e.g. IVA)"),
      taxRate: z.number().optional().describe("Tax rate percentage (e.g. 16)"),
      discount: z.number().optional().describe("Total discount amount"),
      total: z.number().describe("Grand total"),
      brandColor: z.string().optional().describe("Brand color hex (e.g. '#2563eb'). Default: black"),
      currency: z.string().optional().describe("Currency code (e.g. 'MXN', 'USD'). Default: MXN"),
      inline_pdf: z.boolean().optional().describe("Return PDF as base64 blob instead of URL. Default: false"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { documentId, name, inline_pdf, ...data } = params;
      const result = await editQuotation(ctx, { documentId, data, name });
      return quotationPdfResponse(result.document, result.pdf, inline_pdf, ctx);
    })
  );

  const listResultSchema = z.object({
    name: z.string().describe("List name (e.g. 'OFAC SDN', 'PEP México Federal', 'UIF Lista de Bloqueados', 'Interpol', 'EU Sanctions')"),
    searched: z.boolean().describe("Whether this list was searched"),
    match: z.boolean().describe("Whether a match was found"),
    details: z.string().optional().describe("Match details or additional info"),
  });

  const subjectSchema = z.object({
    name: z.string().describe("Full name of the person being screened"),
    rfc: z.string().optional().describe("RFC (tax ID)"),
    curp: z.string().optional().describe("CURP"),
    dob: z.string().optional().describe("Date of birth (ISO string)"),
    nationality: z.string().optional().describe("Nationality"),
  });

  server.tool(
    "create_screening_report",
    `Create a screening/compliance report (BlackPLD, PEP, sanctions) from structured data. Returns the document + PDF.
The template generates a professional single-page report with: subject card, risk level badge, lists results table (with checkmarks/alerts), findings section, and analyst signature.`,
    {
      name: z.string().optional().describe("Document name. Default: 'Reporte Screening — {subject.name}'"),
      subject: subjectSchema,
      searchDate: z.string().describe("Date the search was performed (ISO string)"),
      lists: z.array(listResultSchema).describe("Results from each list/database searched"),
      riskLevel: z.enum(["none", "low", "medium", "high", "critical"]).describe("Overall risk assessment"),
      findings: z.array(z.string()).optional().describe("Key findings or observations"),
      analyst: z.string().optional().describe("Name of the analyst who performed the screening"),
      folio: z.string().optional().describe("Report folio/number"),
      notes: z.string().optional().describe("Additional notes"),
      companyName: z.string().optional().describe("Company name for header (default: 'BlackPLD')"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { name, ...data } = params;
      const result = await createScreeningReport(ctx, { data, name });
      return structuredDocResultHandler(result);
    })
  );

  server.tool(
    "edit_screening_report",
    `Edit an existing screening report with updated structured data. Rebuilds the HTML and regenerates the PDF.`,
    {
      documentId: z.string().describe("ID of the screening report document to edit"),
      name: z.string().optional().describe("New document name"),
      subject: subjectSchema,
      searchDate: z.string().describe("Date the search was performed (ISO string)"),
      lists: z.array(listResultSchema).describe("Results from each list/database searched"),
      riskLevel: z.enum(["none", "low", "medium", "high", "critical"]).describe("Overall risk assessment"),
      findings: z.array(z.string()).optional().describe("Key findings or observations"),
      analyst: z.string().optional().describe("Analyst name"),
      folio: z.string().optional().describe("Report folio/number"),
      notes: z.string().optional().describe("Additional notes"),
      companyName: z.string().optional().describe("Company name for header"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { documentId, name, ...data } = params;
      const result = await editScreeningReport(ctx, { documentId, data, name });
      return structuredDocResultHandler(result);
    })
  );

  const dimensionSchema = z.object({
    name: z.string().describe("Dimension name (e.g. 'Structured Data', 'Content Authority', 'Technical SEO')"),
    score: z.number().describe("Score for this dimension"),
    maxScore: z.number().describe("Maximum possible score for this dimension"),
    details: z.string().optional().describe("Brief explanation of the score"),
  });

  server.tool(
    "create_geo_scorecard",
    `Create a GEO (Generative Engine Optimization) scorecard from structured data. Returns the document + PDF.
The template generates a dark-themed multi-page scorecard with: domain header, overall score badge, dimension progress bars, and recommendations list.`,
    {
      name: z.string().optional().describe("Document name. Default: 'GEO Scorecard — {domain}'"),
      domain: z.string().describe("Domain being evaluated (e.g. 'example.com')"),
      overallScore: z.number().describe("Overall GEO score"),
      maxScore: z.number().optional().describe("Maximum possible score (default: 10)"),
      dimensions: z.array(dimensionSchema).describe("Individual scoring dimensions"),
      recommendations: z.array(z.string()).optional().describe("Actionable recommendations (generates page 2 if provided)"),
      date: z.string().optional().describe("Evaluation date. Default: today"),
      analyst: z.string().optional().describe("Analyst name"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { name, ...data } = params;
      const result = await createGeoScorecard(ctx, { data, name });
      return structuredDocResultHandler(result);
    })
  );

  server.tool(
    "edit_geo_scorecard",
    `Edit an existing GEO scorecard with updated structured data. Rebuilds the HTML and regenerates the PDF.`,
    {
      documentId: z.string().describe("ID of the GEO scorecard document to edit"),
      name: z.string().optional().describe("New document name"),
      domain: z.string().describe("Domain being evaluated"),
      overallScore: z.number().describe("Overall GEO score"),
      maxScore: z.number().optional().describe("Maximum possible score (default: 10)"),
      dimensions: z.array(dimensionSchema).describe("Individual scoring dimensions"),
      recommendations: z.array(z.string()).optional().describe("Actionable recommendations"),
      date: z.string().optional().describe("Evaluation date"),
      analyst: z.string().optional().describe("Analyst name"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { documentId, name, ...data } = params;
      const result = await editGeoScorecard(ctx, { documentId, data, name });
      return structuredDocResultHandler(result);
    })
  );

  // ─── Tournament Schedule ──────────────────────────────────────────

  const tournamentMatchSchema = z.object({
    court: z.string().describe("Court name (e.g. 'Cancha 1')"),
    startTime: z.string().describe("Start time in HH:mm 24h format (e.g. '03:00')"),
    endTime: z.string().describe("End time in HH:mm 24h format (e.g. '04:30')"),
    category: z.string().describe("Category (e.g. 'Primera Varonil Pro')"),
    phase: z.string().describe("Phase: 'playoff', 'semifinal', 'final', 'Fase de grupos', etc. Determines card color (green for playoff/final, blue for grupos, yellow for other)"),
    teamA: z.string().optional().describe("First team/player"),
    teamB: z.string().optional().describe("Second team/player"),
    group: z.string().optional().describe("Group name (e.g. 'Varonil')"),
    notes: z.string().optional().describe("Extra info (e.g. 'Por definir')"),
    color: z.string().optional().describe("Override card color: 'green', 'blue', 'yellow', 'purple'. Default: auto from phase"),
  });

  server.tool(
    "create_tournament_schedule",
    `Template-based tool. Pass structured match data (tournamentName, matches[], courts, etc.) and the template auto-generates a professional calendar grid document with time rows, court columns, and color-coded match cards. Do NOT pass HTML — this tool builds it from your data. For custom HTML use create_document instead.`,
    {
      name: z.string().optional().describe("Document name. Default: 'Calendario — {tournamentName} — {gameDate}'"),
      tournamentName: z.string().describe("Tournament name (e.g. 'Torneo Smatch')"),
      dateRange: z.string().optional().describe("Tournament date range (e.g. 'Del 19 de diciembre al 31 de enero de 2026')"),
      clubName: z.string().describe("Club/venue name (e.g. 'Smatch Padel Club')"),
      location: z.string().describe("City/state (e.g. 'Pachuca, Hidalgo')"),
      gameDate: z.string().optional().describe("Specific day for this schedule (e.g. '20 de diciembre 2025'). Required for single-day, omit for multi-day (use 'days' instead)."),
      matches: z.array(tournamentMatchSchema).optional().describe("Matches for a single-day schedule. Required if not using 'days'."),
      days: z.array(z.object({
        gameDate: z.string().describe("Day label (e.g. '20 de diciembre 2025')"),
        matches: z.array(tournamentMatchSchema).describe("Matches for this day"),
      })).optional().describe("Multi-day schedule: one page per day. Use instead of 'matches' for tournaments spanning multiple days."),
      courts: z.array(z.string()).optional().describe("Court names in order. Auto-detected from matches if omitted"),
      logoUrl: z.string().optional().describe("Logo URL or data URI"),
      logoSvg: z.string().optional().describe("Raw SVG string for inline logo (alternative to logoUrl). CSS var(--primary) in the SVG will be replaced with brandColor."),
      brandColor: z.string().optional().describe("Primary brand color (hex). Default: '#1a1a1a'"),
      disclaimer: z.string().optional().describe("Footer disclaimer text"),
      startHour: z.number().optional().describe("Grid start hour (0-23). Default: auto from matches"),
      endHour: z.number().optional().describe("Grid end hour (1-24). Default: auto from matches"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { name, ...data } = params;
      const result = await createTournamentSchedule(ctx, { data: data as any, name });
      return structuredDocResultHandler(result);
    })
  );

  server.tool(
    "edit_tournament_schedule",
    `Edit an existing tournament schedule. Pass updated structured data — the template rebuilds the HTML and regenerates the PDF. Do NOT pass HTML.`,
    {
      documentId: z.string().describe("ID of the tournament schedule document to edit"),
      name: z.string().optional().describe("New document name"),
      tournamentName: z.string().optional().describe("Tournament name"),
      dateRange: z.string().optional().describe("Tournament date range"),
      clubName: z.string().optional().describe("Club/venue name"),
      location: z.string().optional().describe("City/state"),
      gameDate: z.string().optional().describe("Specific day for this schedule"),
      matches: z.array(tournamentMatchSchema).optional().describe("Matches for single-day schedule"),
      days: z.array(z.object({
        gameDate: z.string().describe("Day label"),
        matches: z.array(tournamentMatchSchema).describe("Matches for this day"),
      })).optional().describe("Multi-day: one page per day"),
      courts: z.array(z.string()).optional().describe("Court names in order"),
      logoUrl: z.string().optional().describe("Logo URL or data URI"),
      logoSvg: z.string().optional().describe("Raw SVG string for inline logo"),
      brandColor: z.string().optional().describe("Primary brand color (hex)"),
      disclaimer: z.string().optional().describe("Footer disclaimer text"),
      startHour: z.number().optional().describe("Grid start hour"),
      endHour: z.number().optional().describe("Grid end hour"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { documentId, name, ...data } = params;
      const result = await editTournamentSchedule(ctx, { documentId, data: data as any, name });
      return structuredDocResultHandler(result);
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
    "Add a new page to a document. If html is omitted, adds a blank page. afterPageIndex is 0-based; omit to append at the end. If providing html, it MUST follow letter-page layout rules: root <section class=\"w-[8.5in] h-[11in] relative overflow-hidden flex flex-col\">, shrink-0 headers/footers, flex-1 overflow-hidden content area, semantic color classes only. CRITICAL: HTML must be well-formed with balanced tags — unbalanced tags break the flipbook viewer. See set_page_html description or call get_docs(\"document-design\") for full rules.",
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
    `Replace the ENTIRE HTML of a single page. This is the primary tool for editing pages — use it when rewriting or significantly changing a page. Only requires pageId (from get_document sections[].id) and the new HTML. For surgical edits to a specific element within a page, use set_section_html instead.

DOCUMENT PAGE LAYOUT RULES (MANDATORY):
- Root element: <section class="w-[8.5in] h-[11in] relative overflow-hidden flex flex-col">
- Top bar: <div class="shrink-0 h-1.5 bg-primary w-full"></div>
- Content wrapper: <div class="flex-1 overflow-hidden px-[0.75in] py-[0.5in] flex flex-col">
- Footer: <div class="shrink-0 w-full px-[0.75in] py-3 flex justify-between items-center border-t border-gray-200">
- Headers/footers use shrink-0. Content area uses flex-1 overflow-hidden.
- Nested flex children that should share space: add min-h-0 alongside flex-1.
- Tables: max 5 columns, text-xs, never cause horizontal scroll.
- Grids: max grid-cols-2 for content (grid-cols-4 only for small KPI cards), gap-6.
- Images: max h-40 inside content pages, w-full object-cover rounded-lg.
- Text sizes: body text-sm/text-base, headings text-3xl max (text-6xl ONLY on cover pages).
- Colors: ONLY semantic classes (bg-primary, text-on-surface, bg-surface-alt, etc.) — never hardcoded hex.
- NO absolute positioning that escapes the section container.
- NO JavaScript, NO Chart.js — use CSS bars/conic-gradient for charts.
- Icons: use inline SVG (Lucide style) or data-icon-query="icon-name".
- Images: use data-image-query="english search query" for auto-enrichment via Pexels.
- CRITICAL: HTML MUST be well-formed. Every <div> needs a </div>, every <section> needs a </section>. Unbalanced tags BREAK the flipbook viewer and corrupt the document. Double-check tag balance before submitting, especially around SVG elements — do NOT add extra </div> after </svg>.
Call get_docs("document-design") for full design guide with validated patterns.`,
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

  server.tool(
    "replace_html",
    "Replace a specific HTML substring within a page (string-based, like Claude Code's edit model). This is the PREFERRED tool for surgical edits — find the exact HTML snippet you want to change using get_page_html, then replace it. More reliable than set_section_html because it doesn't depend on CSS selectors.",
    {
      documentId: z.string().describe("The document ID"),
      pageId: z.string().describe("The page ID containing the HTML to edit"),
      old_html: z.string().describe("The exact HTML substring to find and replace (must match current page HTML exactly)"),
      new_html: z.string().describe("The new HTML to replace it with"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await replaceHtmlInPage(ctx, params.documentId, params.pageId, params.old_html, params.new_html);
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
      return { content: [{ type: "text", text: JSON.stringify({ total: result.total, sections: result.sections.map((s: any) => ({ id: s.id, order: s.order, type: s.type, name: s.label })) }, null, 2) }] };
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
    "pdf_to_images",
    "Convert a PDF to page images (PNG). Accepts either a fileId of an uploaded PDF OR raw base64 PDF data. Returns one image per page. Use these images with vision to generate HTML, then create a document with create_document following get_docs('document-design') rules.",
    {
      fileId: z.string().optional().describe("File ID of an uploaded PDF (alternative to base64)"),
      base64: z.string().optional().describe("Raw PDF as base64 string (alternative to fileId — avoids uploading)"),
      maxPages: z.number().optional().describe("Max pages to convert (default 20)"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;

      let pdfBuffer: Buffer;

      if (params.base64) {
        pdfBuffer = Buffer.from(params.base64, "base64");
      } else if (params.fileId) {
        const file = await db.file.findUnique({ where: { id: params.fileId } });
        if (!file || file.ownerId !== ctx.user.id) {
          return { content: [{ type: "text", text: "File not found" }], isError: true };
        }
        if (!file.contentType?.includes("pdf")) {
          return { content: [{ type: "text", text: "File must be a PDF" }], isError: true };
        }
        const { getReadClientForPlatformFile, getClientForFile } = await import("../storage");
        const client = file.storageProviderId
          ? await getClientForFile(file.storageProviderId, ctx.user.id)
          : getReadClientForPlatformFile(file);
        const readUrl = await client.getReadUrl(file.storageKey);
        const resp = await fetch(readUrl);
        if (!resp.ok) {
          return { content: [{ type: "text", text: "Failed to read PDF file" }], isError: true };
        }
        pdfBuffer = Buffer.from(await resp.arrayBuffer());
      } else {
        return { content: [{ type: "text", text: "Provide either fileId or base64" }], isError: true };
      }

      const { pdfToImages } = await import("../core/pdfToImages");
      const pages = await pdfToImages(pdfBuffer, { maxPages: params.maxPages ?? 20 });

      if (pages.length === 0) {
        return { content: [{ type: "text", text: "PDF has no pages" }], isError: true };
      }

      return {
        content: pages.map((p, i) => ({
          type: "image" as const,
          mimeType: "image/png" as const,
          data: p.image,
        })),
      };
    })
  );

  server.tool(
    "get_page_screenshot",
    "Take a screenshot of a single document page. Returns a PNG image of one page (letter-sized). Requires Chrome installed locally — designed for Claude Code MCP usage.",
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

  // --- Document PDF Tool ---

  server.tool(
    "get_document_pdf",
    "Generate a PDF of a document. Returns the PDF as base64-encoded data. Requires Chrome installed locally — designed for Claude Code MCP usage.",
    {
      documentId: z.string().describe("The document ID"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { takeDocumentPdf } = await import("../core/documentScreenshot");
      const pdf = await takeDocumentPdf(ctx.user.id, params.documentId);
      if (!pdf) {
        return { content: [{ type: "text" as const, text: "Document not found or has no pages" }], isError: true };
      }
      return {
        content: [{
          type: "resource" as const,
          resource: {
            uri: `easybits://documents/${params.documentId}/pdf`,
            mimeType: "application/pdf",
            blob: pdf.toString("base64"),
          },
        }],
      };
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
      extras: z.array(z.object({ name: z.string(), hex: z.string() })).optional().describe("Extra named colors beyond the 4 semantic slots"),
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
        extras: z.array(z.object({ name: z.string(), hex: z.string() })).optional().describe("Extra named colors"),
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
    "Upload a file to a website via presigned URL. Returns a putUrl — you must PUT the content there, then call update_file(status: 'DONE'). Best for large/binary files (>1MB). For text files <1MB (HTML/CSS/JS), prefer deploy_website_file which does everything in one call.",
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

  // --- Deploy Website File (single-call) ---

  server.tool(
    "deploy_website_file",
    "Deploy a file to a website in a single call — no presigned URL or status update needed. Pass the file content directly (text or base64). Max 1MB. The file is immediately live at https://{slug}.easybits.cloud/{fileName}.",
    {
      websiteId: z.string().describe("The website ID"),
      fileName: z.string().describe("File name (e.g. 'index.html', 'styles.css', 'script.js')"),
      content: z.string().describe("File content as text (or base64 if encoding is 'base64')"),
      contentType: z.string().optional().default("text/html").describe("MIME type (default: 'text/html')"),
      encoding: z.enum(["text", "base64"]).optional().default("text").describe("Content encoding: 'text' (default) or 'base64' for binary"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { deployWebsiteFile } = await import("../core/operations");
      const result = await deployWebsiteFile(ctx, params);
      return { content: [{ type: "text", text: JSON.stringify({ fileId: result.file.id, fileName: result.file.name, url: result.file.url }, null, 2) }] };
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
    "Execute multiple SQL statements in a batch (max 50). Useful for migrations or multi-step operations.",
    {
      dbId: z.string().describe("The database ID"),
      statements: z.array(z.object({
        sql: z.string().describe("SQL statement"),
        args: z.array(z.unknown()).optional().describe("Positional arguments"),
      })).describe("Array of SQL statements (1-50)"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await execDatabase(ctx, params.dbId, params.statements);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.tool(
    "db_import",
    "Bulk import rows into a table. Up to 10,000 rows per request. Values are auto-converted to strings (sqld requirement). Much faster than db_exec for large inserts.",
    {
      dbId: z.string().describe("The database ID"),
      table: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/).describe("Target table name"),
      columns: z.array(z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)).min(1).describe("Column names"),
      rows: z.array(z.array(z.unknown())).min(1).max(10000).describe("Array of row values (each row is an array matching columns order)"),
      onConflict: z.enum(["ignore", "replace"]).optional().describe("Conflict handling: 'ignore' skips duplicates, 'replace' upserts"),
    },
    wrapHandler(async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await importDatabase(ctx, params.dbId, params.table, params.columns, params.rows, params.onConflict);
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
      section: z.enum(VALID_SECTIONS as [string, ...string[]]).optional().describe("Filter to a specific section: about, quickstart, files, bulk, images, sharing, webhooks, websites, presentations, presentation-design, documents, document-design, account, sdk, errors"),
    },
    async (params) => {
      const markdown = getDocsMarkdown(params.section);
      return { content: [{ type: "text", text: markdown }] };
    }
  );

  return server;
}
