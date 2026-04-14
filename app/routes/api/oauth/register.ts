import { db } from "~/.server/db";
import { randomToken, sha256 } from "~/.server/oauth";

// POST /oauth/register — RFC 7591 Dynamic Client Registration
// Unauthenticated: any MCP client (e.g. Claude.ai Cowork) may register.
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

  const redirectUris: unknown = body.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    !redirectUris.every((u) => typeof u === "string")
  ) {
    return Response.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris required" },
      { status: 400 }
    );
  }

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
      client_secret: clientSecret,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    },
    { status: 201 }
  );
}
