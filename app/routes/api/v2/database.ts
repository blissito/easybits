import type { Route } from "./+types/database";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getDatabase, deleteDatabase, updateDatabase } from "~/.server/core/databaseOperations";

// GET /api/v2/databases/:dbId
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await getDatabase(ctx, params.dbId!);
  return Response.json(result);
}

// DELETE /api/v2/databases/:dbId
// PATCH  /api/v2/databases/:dbId — { name?, description? } (renombrar; el id no cambia)
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "PATCH") {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Body must be JSON: { name?, description? }" }, { status: 400 });
    }
    const result = await updateDatabase(ctx, params.dbId!, { name: body.name, description: body.description });
    return Response.json(result);
  }

  if (request.method === "DELETE") {
    const result = await deleteDatabase(ctx, params.dbId!);
    return Response.json(result);
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
