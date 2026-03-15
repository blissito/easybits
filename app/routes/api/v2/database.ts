import type { Route } from "./+types/database";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getDatabase, deleteDatabase } from "~/.server/core/databaseOperations";

// GET /api/v2/databases/:dbId
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await getDatabase(ctx, params.dbId!);
  return Response.json(result);
}

// DELETE /api/v2/databases/:dbId
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "DELETE") {
    const result = await deleteDatabase(ctx, params.dbId!);
    return Response.json(result);
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
