import { db } from "~/.server/db";
import { randomToken, sha256 } from "~/.server/oauth";

// POST /oauth/register — RFC 7591 Dynamic Client Registration
// Unauthenticated: any MCP client (e.g. Claude.ai Cowork) may register. Nunca queda
// como cliente de casa: el authorize le enseña la pantalla de consentimiento.

function isValidRedirect(raw: unknown): boolean {
  if (typeof raw !== "string" || raw.length > 500) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
}
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_client_metadata" }, { status: 400 });
  }

  // Sólo https o loopback http, sin fragmento ni credenciales: el authorize compara
  // exacto (salvo el puerto del loopback), así que esto acota a dónde puede ir un code.
  const redirectUris: unknown = body.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    redirectUris.length > 10 ||
    !redirectUris.every(isValidRedirect)
  ) {
    return Response.json(
      {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris: 1 to 10 https or loopback http URLs, no fragment",
      },
      { status: 400 }
    );
  }
  // Público (PKCE) si lo pide; si no, confidencial con client_secret_post.
  const isPublic = body.token_endpoint_auth_method === "none";
  const clientId = `ebc_${randomToken(12)}`;
  const clientSecret = randomToken(32);
  const clientName =
    typeof body.client_name === "string" ? body.client_name.slice(0, 120) : "MCP Client";

  await db.oAuthClient.create({
    data: {
      clientId,
      clientSecretHash: sha256(clientSecret),
      clientName,
      redirectUris: redirectUris as string[],
    },
  });

  return Response.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(isPublic ? {} : { client_secret: clientSecret, client_secret_expires_at: 0 }),
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: isPublic ? "none" : "client_secret_post",
    },
    { status: 201 }
  );
}
