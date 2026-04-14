import { redirect } from "react-router";
import { db } from "~/.server/db";
import { getUserOrNull } from "~/.server/getters";
import { randomToken, sha256 } from "~/.server/oauth";

// GET /oauth/authorize — OAuth 2.1 authorization endpoint (PKCE S256 required)
// If no session, redirects to /login?next=<same url>. Once authenticated,
// auto-approves (user explicitly initiated the MCP connector flow from Claude).
export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const responseType = url.searchParams.get("response_type");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") || "S256";
  const state = url.searchParams.get("state") || "";
  const scope = url.searchParams.get("scope") || "mcp";

  if (!clientId || !redirectUri || responseType !== "code" || !codeChallenge) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  if (codeChallengeMethod !== "S256") {
    return Response.json({ error: "invalid_request", error_description: "only S256 supported" }, { status: 400 });
  }

  const client = await db.oAuthClient.findUnique({ where: { clientId } });
  if (!client) {
    return Response.json({ error: "invalid_client" }, { status: 400 });
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return Response.json({ error: "invalid_redirect_uri" }, { status: 400 });
  }

  const user = await getUserOrNull(request);
  if (!user) {
    const next = encodeURIComponent(url.pathname + url.search);
    return redirect(`/login?next=${next}`);
  }

  // Auto-approve: generate code, persist, redirect to client.
  const code = randomToken(32);
  await db.oAuthAuthCode.create({
    data: {
      codeHash: sha256(code),
      clientId,
      userId: user.id,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      scope,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
    },
  });

  const sep = redirectUri.includes("?") ? "&" : "?";
  const location = `${redirectUri}${sep}code=${encodeURIComponent(code)}${
    state ? `&state=${encodeURIComponent(state)}` : ""
  }`;
  return redirect(location);
}
