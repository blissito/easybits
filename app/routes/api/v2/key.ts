import type { Route } from "./+types/key";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { revokeApiKey } from "~/.server/iam";

// DELETE /api/v2/keys/:keyId
// Antes sólo aceptaba la cookie de sesión: la CLI y ghosty.studio (que revoca con la propia
// key) recibían 401. Ahora cualquier credencial de la cuenta con scope DELETE.
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "DELETE") {
    requireScope(ctx, "DELETE");
    if (ctx.workspaceId) return Response.json({ error: "Workspace-scoped keys cannot revoke account keys" }, { status: 403 });
    const r = await revokeApiKey(params.keyId!, ctx.user.id);
    if (r.count === 0) return Response.json({ error: "Key not found" }, { status: 404 });
    return Response.json({ success: true });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
