import type { Route } from "./+types/workspace";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { getWorkspace, updateWorkspace, deleteWorkspace } from "~/.server/core/operations";

// GET /api/v2/workspaces/:workspaceId
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const workspace = await getWorkspace(ctx, params.workspaceId!);
  return Response.json(workspace);
}

// PATCH or DELETE /api/v2/workspaces/:workspaceId
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "DELETE") {
    requireScope(ctx, "DELETE");
    const result = await deleteWorkspace(ctx, params.workspaceId!);
    return Response.json(result);
  }

  if (request.method === "PATCH") {
    requireScope(ctx, "WRITE");
    const body = await request.json();
    const updated = await updateWorkspace(ctx, params.workspaceId!, {
      name: typeof body.name === "string" ? body.name : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
      quotaBytes:
        body.quotaBytes === null || typeof body.quotaBytes === "number"
          ? body.quotaBytes
          : undefined,
    });
    return Response.json({ ok: true, workspace: updated });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
