import type { Route } from "./+types/databases";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { listDatabases, createDatabase, attachDatabase } from "~/.server/core/databaseOperations";

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
    // `attach: true`: registra la base que una máquina tuya ya usa (`/v1/db/<name>/`), sin crear nada.
    if (body.attach === true) {
      const result = await attachDatabase(ctx, { name: body.name, description: body.description });
      return Response.json(result, { status: 201 });
    }
    const result = await createDatabase(ctx, {
      name: body.name,
      description: body.description,
    });
    return Response.json(result, { status: 201 });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
