import type { Route } from "./+types/fileShare";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { shareFile } from "~/.server/core/operations";

// POST /api/v2/files/:fileId/share
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const result = await shareFile(ctx, {
    fileId: params.fileId!,
    targetEmail: body.targetEmail,
    canRead: body.canRead,
    canWrite: body.canWrite,
    canDelete: body.canDelete,
  });
  return Response.json(result, { status: 201 });
}
