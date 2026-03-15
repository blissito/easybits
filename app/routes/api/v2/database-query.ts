import type { Route } from "./+types/database-query";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { queryDatabase, execDatabase } from "~/.server/core/databaseOperations";

// POST /api/v2/databases/:dbId/query
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();

  // Batch mode: { statements: [{ sql, args }, ...] }
  if (body.statements && Array.isArray(body.statements)) {
    const result = await execDatabase(ctx, params.dbId!, body.statements);
    return Response.json(result);
  }

  // Single query: { sql, args }
  if (body.sql) {
    const result = await queryDatabase(ctx, params.dbId!, body.sql, body.args || []);
    return Response.json(result);
  }

  return Response.json(
    { error: "Provide 'sql' for single query or 'statements' for batch" },
    { status: 400 }
  );
}
