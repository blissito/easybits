import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "~/.server/mcp/server";
import { authenticateRequest } from "~/.server/apiAuth";
import { RateLimiter } from "~/.server/rateLimiter";

// Per-user rate limit for MCP. Keyed by user id (not IP) so users behind a
// shared NAT/proxy don't share a bucket, and so the ceiling fits agentic
// batch workloads. Ample headroom: 300 calls/min per user.
const mcpRateLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 300 });

// Stateless mode — each request is independent, auth via Bearer token
export async function handleMcp(request: Request): Promise<Response> {
  const ctx = await authenticateRequest(request);
  if (!ctx) {
    const base = process.env.BASE_URL || "https://www.easybits.cloud";
    return Response.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`,
        },
      }
    );
  }

  const { allowed, resetTime } = await mcpRateLimiter.checkRateLimit(ctx.user.id);
  if (!allowed) {
    return Response.json(
      { error: "Rate limit exceeded", message: "Too many requests, slow down." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil((resetTime - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  // Parse tool groups from query string
  const url = new URL(request.url);
  const toolsParam = url.searchParams.get("tools");
  // Entradas con prefijo `-` = per-tool DENY (default = todas las tools del bucket
  // activas; el user destila una → llega como `-<tool>`). El resto = bucket keys.
  const parts = toolsParam ? toolsParam.split(",").map((g) => g.trim()).filter(Boolean) : [];
  const denyTools = parts.filter((p) => p.startsWith("-")).map((p) => p.slice(1));
  const groups = parts.length ? parts.filter((p) => !p.startsWith("-")) : undefined;

  // Per-connection provider keys (passed as query params in the connector URL
  // or as request headers). These are NOT stored — they live only on the
  // AuthContext for the duration of this request.
  const openaiKey =
    url.searchParams.get("openai_key") ||
    request.headers.get("x-openai-key") ||
    undefined;

  const ctxWithKeys = { ...ctx, providerKeys: { openai: openaiKey } };

  const server = createMcpServer(groups, denyTools.length ? denyTools : undefined);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  await server.connect(transport);

  return transport.handleRequest(request, {
    authInfo: ctxWithKeys as any,
  });
}
