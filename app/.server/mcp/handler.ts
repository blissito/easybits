import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "~/.server/mcp/server";
import { authenticateRequest } from "~/.server/apiAuth";

// Stateless mode — each request is independent, auth via Bearer token
export async function handleMcp(request: Request): Promise<Response> {
  const ctx = await authenticateRequest(request);
  if (!ctx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  await server.connect(transport);

  return transport.handleRequest(request, {
    authInfo: ctx as any,
  });
}
