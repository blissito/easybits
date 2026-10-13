import { revokeByToken, sha256 } from "~/.server/oauth";
import { findOAuthClient } from "~/.server/oauthClients";

// POST /oauth/revoke — RFC 7009. Acepta un refresh token o un access token y revoca la
// concesión completa (usuario + cliente). Responde 200 aunque el token no exista: así no
// se puede usar para averiguar qué tokens son válidos.
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "invalid_request" }, { status: 405 });
  }
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("token") || "");
  if (!token) return Response.json({ error: "invalid_request" }, { status: 400 });

  const clientId = String(form?.get("client_id") || "") || undefined;
  if (clientId) {
    const client = await findOAuthClient(clientId);
    if (!client) return Response.json({ error: "invalid_client" }, { status: 401 });
    const secret = form?.get("client_secret");
    if (typeof secret === "string" && secret && sha256(secret) !== client.clientSecretHash) {
      return Response.json({ error: "invalid_client" }, { status: 401 });
    }
  }

  await revokeByToken(token, clientId);
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}

export function loader() {
  return Response.json({ error: "invalid_request" }, { status: 405 });
}
