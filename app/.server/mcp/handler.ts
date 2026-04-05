import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "~/.server/mcp/server";
import { authenticateRequest } from "~/.server/apiAuth";
import { applyRateLimit } from "~/.server/rateLimiter";

// Stateless mode — each request is independent, auth via Bearer token
export async function handleMcp(request: Request): Promise<Response> {
  const rateLimitResponse = await applyRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  const ctx = await authenticateRequest(request);
  if (!ctx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse tool groups from query string
  const url = new URL(request.url);
  const toolsParam = url.searchParams.get("tools");
  const groups = toolsParam ? toolsParam.split(",").map(g => g.trim()) : undefined;

  const server = createMcpServer(groups);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  await server.connect(transport);

  return transport.handleRequest(request, {
    authInfo: ctx as any,
  });
}
