import type { Route } from "./+types/file-duplicate";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { duplicateFile } from "~/.server/core/operations";

// POST /api/v2/files/:fileId/duplicate
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const result = await duplicateFile(ctx, params.fileId!, body.name);
    return Response.json(result, { status: 201 });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
