// ─────────────────────────────────────────────────────────────────────────────
// Dynamic tool discovery — meta-tools that expose the FULL Easybits catalog
// regardless of the toolGroup the client connected with.
//
// Why this exists:
//   The MCP spec offers `notifications/tools/list_changed` so a server can push
//   tool-list updates to the client without reconnect. Claude Code does NOT yet
//   honor that notification (issue #13646), so a user connected with
//   `?tools=core` cannot use a documents-only tool without restarting.
//
// Pattern: "wrapper / tools-on-demand" (Cloudflare MCP, Smithery, mcp-context-forge).
//   1. `discover_tools(query)` returns name + description + JSON Schema for any
//      tool in the catalog — works on tools that are registered but DISABLED
//      (i.e. hidden from `tools/list` by the active group's allowlist).
//   2. `run_tool(name, params)` dispatches by reading `_registeredTools[name]`
//      directly, validates the params against the tool's own zod schema, and
//      calls the underlying handler. Bypasses the disabled-flag gate.
//
// Both meta-tools are installed unconditionally — they survive any allowlist
// filter — so the agent can always reach them.
// ─────────────────────────────────────────────────────────────────────────────
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

interface RegisteredToolInternal {
  description?: string;
  inputSchema?: any;
  handler: (args: any, extra: any) => Promise<any>;
  enabled: boolean;
  enable: () => void;
  disable: () => void;
}

const META_TOOL_NAMES = new Set(["discover_tools", "run_tool"]);

function getRegisteredTools(server: McpServer): Record<string, RegisteredToolInternal> {
  return ((server as any)._registeredTools ?? {}) as Record<string, RegisteredToolInternal>;
}

function dumpSchema(schema: any): unknown {
  if (!schema) return { type: "object", properties: {} };
  try {
    return zodToJsonSchema(schema, { target: "openApi3" });
  } catch {
    return { type: "object", properties: {} };
  }
}

export function installDynamicTools(server: McpServer) {
  server.tool(
    "discover_tools",
    "Search the FULL Easybits MCP catalog — including tools NOT loaded in your current session's toolGroup. Returns name, description, inputSchema (JSON Schema) and `loaded` (whether it's already in tools/list). After finding what you need, call it via `run_tool({ name, params })` — no reconnect required. Combine with `run_tool` to escape the active toolGroup without restarting Claude.",
    {
      query: z
        .string()
        .optional()
        .describe("Free-text search across tool name + description (case-insensitive). Omit to list everything."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Max results (default 25)."),
    },
    async (params) => {
      const q = (params.query ?? "").toLowerCase().trim();
      const limit = params.limit ?? 25;
      const all = getRegisteredTools(server);
      const items = Object.entries(all)
        .filter(([name]) => !META_TOOL_NAMES.has(name))
        .filter(([name, t]) => {
          if (!q) return true;
          const haystack = `${name} ${t.description ?? ""}`.toLowerCase();
          return haystack.includes(q);
        })
        .map(([name, t]) => ({
          name,
          description: t.description ?? "",
          inputSchema: dumpSchema(t.inputSchema),
          loaded: t.enabled,
        }));

      const truncated = items.length > limit;
      const result = {
        items: items.slice(0, limit),
        total: items.length,
        truncated,
        hint: truncated
          ? `Showing ${limit} of ${items.length} — refine \`query\` or raise \`limit\`.`
          : undefined,
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "run_tool",
    "Dispatch any Easybits tool by name — even tools NOT loaded in the active toolGroup. Use this after `discover_tools` to invoke a tool without reconnecting. `params` must match the tool's inputSchema (run discover_tools first to inspect it). Returns the tool's normal response shape.",
    {
      name: z.string().describe("Tool name (from discover_tools)"),
      params: z
        .record(z.unknown())
        .optional()
        .describe("Tool arguments matching its inputSchema. Default: {}."),
    },
    async (input, extra) => {
      if (META_TOOL_NAMES.has(input.name)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: `Cannot dispatch the meta-tool '${input.name}' through run_tool.` },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      const all = getRegisteredTools(server);
      const tool = all[input.name];
      if (!tool) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: `Unknown tool: ${input.name}. Use discover_tools to find available tools.`,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      let validated: any = input.params ?? {};
      if (tool.inputSchema && typeof tool.inputSchema.safeParseAsync === "function") {
        const result = await tool.inputSchema.safeParseAsync(validated);
        if (!result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error: `Invalid args for ${input.name}: ${result.error.message}`,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
        validated = result.data;
      }

      try {
        return await tool.handler(validated, extra);
      } catch (err) {
        if (err instanceof Response) {
          const body = await err.json().catch(() => ({ error: "Unknown error" }));
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: body.error || body.message || "Unknown error", status: err.status },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: String(err) }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
