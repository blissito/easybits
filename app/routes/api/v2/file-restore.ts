import type { Route } from "./+types/file-restore";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { restoreFile } from "~/.server/core/operations";

// POST /api/v2/files/:fileId/restore
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const result = await restoreFile(ctx, params.fileId!);
  return Response.json(result);
}
