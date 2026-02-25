import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listFiles,
  getFile,
  uploadFile,
  deleteFile,
  restoreFile,
  shareFile,
} from "../core/operations";
import { db } from "../db";
import type { AuthContext } from "../apiAuth";

export function createMcpServer() {
  const server = new McpServer({
    name: "easybits",
    version: "1.0.0",
  });

  // --- Tools ---

  server.tool(
    "list_files",
    "List your files (id, name, size, contentType, access, status, createdAt). Returns `{ items, nextCursor }`. Pass `nextCursor` as `cursor` to get the next page. Excludes deleted files.",
    {
      assetId: z.string().optional().describe("Filter by asset ID"),
      limit: z.number().optional().describe("Max results (default 50)"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await listFiles(ctx, params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "get_file",
    "Get file metadata and a signed download URL. Returns file object with a `readUrl` field containing a presigned GET URL (expires in 1h).",
    {
      fileId: z.string().describe("The file ID"),
    },
    async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await getFile(ctx, params.fileId);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "upload_file",
    "Create a file record and get a presigned upload URL. Returns `{ file, putUrl }`. Upload bytes via PUT to `putUrl`. The file is created with status DONE immediately.",
    {
      fileName: z.string().describe("Name of the file"),
      contentType: z.string().describe("MIME type"),
      size: z.number().describe("File size in bytes"),
      assetId: z.string().optional().describe("Associate with an asset"),
      access: z.enum(["public", "private"]).optional().describe("Access level"),
      region: z.enum(["LATAM", "US", "EU"]).optional().describe("Storage region preference"),
    },
    async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await uploadFile(ctx, params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "delete_file",
    "Soft-delete a file (sets status to DELETED). Recoverable for 7 days via `restore_file`, then auto-purged from storage.",
    {
      fileId: z.string().describe("The file ID to delete"),
    },
    async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await deleteFile(ctx, params.fileId);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "restore_file",
    "Restore a soft-deleted file back to DONE status. Only works on files with status DELETED.",
    {
      fileId: z.string().describe("The file ID to restore"),
    },
    async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await restoreFile(ctx, params.fileId);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "share_file",
    "Share a file with another user by email. Creates a permission record. canRead defaults to true, canWrite/canDelete to false. Target user must exist.",
    {
      fileId: z.string().describe("The file ID to share"),
      targetEmail: z.string().describe("Email of the user to share with"),
      canRead: z.boolean().optional().describe("Grant read access (default true)"),
      canWrite: z.boolean().optional().describe("Grant write access"),
      canDelete: z.boolean().optional().describe("Grant delete access"),
    },
    async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const result = await shareFile(ctx, params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "list_providers",
    "List your configured storage providers. If none configured, shows platform default (Tigris).",
    {},
    async (_params, extra) => {
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
    }
  );

  server.tool(
    "set_ai_key",
    "Store your AI provider API key for AI-powered features (search, auto-tagging). Key is encrypted; response shows masked value only.",
    {
      provider: z.enum(["ANTHROPIC", "OPENAI"]).describe("AI provider"),
      apiKey: z.string().describe("Your API key for the provider"),
    },
    async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { setAiKey } = await import("../core/aiKeyOperations");
      const result = await setAiKey(ctx, params.provider, params.apiKey);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "list_ai_keys",
    "List your configured AI provider API keys (values are masked)",
    {},
    async (_params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { listAiKeys } = await import("../core/aiKeyOperations");
      const result = await listAiKeys(ctx);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "delete_ai_key",
    "Remove a stored AI provider API key",
    {
      provider: z.enum(["ANTHROPIC", "OPENAI"]).describe("AI provider to remove"),
    },
    async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { deleteAiKey } = await import("../core/aiKeyOperations");
      const result = await deleteAiKey(ctx, params.provider);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "optimize_image",
    "Convert an image to WebP or AVIF, creating a new file (original unchanged). Default quality: 80 (WebP), 50 (AVIF). Returns `{ file, originalSize, optimizedSize, savings }`.",
    {
      fileId: z.string().describe("ID of the image file to optimize"),
      format: z.enum(["webp", "avif"]).default("webp").describe("Target format"),
      quality: z.number().min(1).max(100).optional().describe("Quality 1-100. Default: 80 for WebP, 50 for AVIF"),
    },
    async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { optimizeImage } = await import("../core/imageOperations");
      const result = await optimizeImage(ctx, params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "search_files",
    "Search files using natural language (AI-powered). Requires an AI key (set_ai_key). Returns up to 20 matching files sorted by newest first.",
    {
      query: z.string().describe("Natural language search query, e.g. 'all PDF files' or 'images uploaded recently'"),
    },
    async (params, extra) => {
      const ctx = extra.authInfo as unknown as AuthContext;
      const { searchFilesWithAI } = await import("../core/ai");
      const results = await searchFilesWithAI(ctx.user.id, params.query);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  return server;
}
