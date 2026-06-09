import type { Route } from "./+types/keys";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { createApiKey, listApiKeys } from "~/.server/iam";

// GET /api/v2/keys
export async function loader({ request }: Route.LoaderArgs) {
  // authenticateRequest acepta cookie de sesión (dashboard), API key Y Bearer
  // OAuth — superset de getUserOrNull, así el SSO puede mintear con su token.
  const { user } = requireAuth(await authenticateRequest(request));
  const keys = await listApiKeys(user.id);
  return Response.json({ keys });
}

// POST /api/v2/keys
export async function action({ request }: Route.ActionArgs) {
  const { user } = requireAuth(await authenticateRequest(request));

  if (request.method === "POST") {
    const body = await request.json();
    const key = await createApiKey(user.id, {
      name: body.name || "Unnamed key",
      scopes: body.scopes || ["READ", "WRITE", "DELETE"],
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });
    return Response.json(key, { status: 201 });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
