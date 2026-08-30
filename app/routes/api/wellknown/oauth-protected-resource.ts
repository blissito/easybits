import { BASE_URL } from "~/.server/oauth";

// GET /.well-known/oauth-protected-resource[/<path del recurso>]
// RFC 9728 — advertises the authorization server protecting /api/mcp.
//
// El sufijo importa: un cliente estricto (Ghosty, por ejemplo) compara el
// `resource` que devolvemos contra la URL exacta que tiene registrada y aborta
// si difieren. Cuando pregunta por `/api/mcp/sandbox`, le contestamos por ese
// recurso, no por el genérico.
export async function loader({ request }: { request: Request }) {
  const { pathname } = new URL(request.url);
  const suffix = pathname.replace("/.well-known/oauth-protected-resource", "");
  const resourcePath = suffix.startsWith("/api/mcp") ? suffix : "/api/mcp";

  return Response.json({
    resource: `${BASE_URL}${resourcePath}`,
    authorization_servers: [BASE_URL],
    bearer_methods_supported: ["header"],
  });
}
