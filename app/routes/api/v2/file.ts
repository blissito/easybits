import type { Route } from "./+types/file";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getFile, deleteFile } from "~/.server/core/operations";

// GET /api/v2/files/:fileId
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await getFile(ctx, params.fileId!);
  return Response.json(result);
}

// DELETE /api/v2/files/:fileId
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "DELETE") {
    const result = await deleteFile(ctx, params.fileId!);
    return Response.json(result);
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
