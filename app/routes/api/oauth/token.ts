import { db } from "~/.server/db";
import {
  issueAccessToken,
  sha256,
  verifyPkceS256,
} from "~/.server/oauth";

// POST /oauth/token — exchanges an authorization code for an access token
// Supports public clients (PKCE only) and confidential clients (client_secret_post).
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  const form = await request.formData();
  const grantType = form.get("grant_type");
  const code = String(form.get("code") || "");
  const redirectUri = String(form.get("redirect_uri") || "");
  const clientId = String(form.get("client_id") || "");
  const codeVerifier = String(form.get("code_verifier") || "");
  const clientSecret = form.get("client_secret");

  if (grantType !== "authorization_code") {
    return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
  }
  if (!code || !redirectUri || !clientId || !codeVerifier) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const client = await db.oAuthClient.findUnique({ where: { clientId } });
  if (!client) {
    return Response.json({ error: "invalid_client" }, { status: 401 });
  }
  // If a secret is provided, validate it (confidential client).
  if (typeof clientSecret === "string" && clientSecret.length > 0) {
    if (sha256(clientSecret) !== client.clientSecretHash) {
      return Response.json({ error: "invalid_client" }, { status: 401 });
    }
  }

  const authCode = await db.oAuthAuthCode.findUnique({
    where: { codeHash: sha256(code) },
  });
  if (!authCode || authCode.used || authCode.expiresAt < new Date()) {
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  }
  if (authCode.clientId !== clientId || authCode.redirectUri !== redirectUri) {
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  }
  if (!verifyPkceS256(codeVerifier, authCode.codeChallenge)) {
    return Response.json({ error: "invalid_grant", error_description: "pkce verification failed" }, { status: 400 });
  }

  await db.oAuthAuthCode.update({
    where: { id: authCode.id },
    data: { used: true },
  });

  const { token, expiresIn } = issueAccessToken(authCode.userId, authCode.scope || "mcp");

  return Response.json({
    access_token: token,
    token_type: "Bearer",
    expires_in: expiresIn,
    scope: authCode.scope || "mcp",
  });
}
