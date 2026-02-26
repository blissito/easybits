import type { Route } from "./+types/files-bulk-delete";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { bulkDeleteFiles } from "~/.server/core/operations";

// POST /api/v2/files/bulk-delete
export async function action({ request }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "POST") {
    const body = await request.json();
    const result = await bulkDeleteFiles(ctx, body.fileIds);
    return Response.json(result);
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
