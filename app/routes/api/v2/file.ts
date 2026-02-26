import type { Route } from "./+types/file";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getFile, deleteFile, updateFile } from "~/.server/core/operations";

// GET /api/v2/files/:fileId
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await getFile(ctx, params.fileId!);
  return Response.json(result);
}

// DELETE or PATCH /api/v2/files/:fileId
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "DELETE") {
    const result = await deleteFile(ctx, params.fileId!);
    return Response.json(result);
  }

  if (request.method === "PATCH") {
    const body = await request.json();
    const result = await updateFile(ctx, {
      fileId: params.fileId!,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.access !== undefined ? { access: body.access } : {}),
      ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    });
    return Response.json(result);
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
