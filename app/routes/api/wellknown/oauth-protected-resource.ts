import { BASE_URL } from "~/.server/oauth";

// GET /.well-known/oauth-protected-resource
// RFC 9728 — advertises the authorization server protecting /api/mcp
export async function loader() {
  return Response.json({
    resource: `${BASE_URL}/api/mcp`,
    authorization_servers: [BASE_URL],
    bearer_methods_supported: ["header"],
  });
}
