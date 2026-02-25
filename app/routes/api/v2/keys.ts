import type { Route } from "./+types/keys";
import { getUserOrNull } from "~/.server/getters";
import { createApiKey, listApiKeys } from "~/.server/iam";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// GET /api/v2/keys
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserOrNull(request);
  if (!user) return unauthorized();
  const keys = await listApiKeys(user.id);
  return Response.json({ keys });
}

// POST /api/v2/keys
export async function action({ request }: Route.ActionArgs) {
  const user = await getUserOrNull(request);
  if (!user) return unauthorized();

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
