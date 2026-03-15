import type { Route } from "./+types/databases";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { listDatabases, createDatabase } from "~/.server/core/databaseOperations";

// GET /api/v2/databases
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await listDatabases(ctx);
  return Response.json(result);
}

// POST /api/v2/databases
export async function action({ request }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "POST") {
    const body = await request.json();
    const result = await createDatabase(ctx, {
      name: body.name,
      description: body.description,
    });
    return Response.json(result, { status: 201 });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
