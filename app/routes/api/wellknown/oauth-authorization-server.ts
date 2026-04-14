import { BASE_URL } from "~/.server/oauth";

// GET /.well-known/oauth-authorization-server
// RFC 8414 — advertises OAuth endpoints for MCP clients (Claude.ai connectors)
export async function loader() {
  return Response.json({
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/oauth/authorize`,
    token_endpoint: `${BASE_URL}/oauth/token`,
    registration_endpoint: `${BASE_URL}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    scopes_supported: ["mcp"],
  });
}
