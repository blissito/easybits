import type { Route } from "./+types/secrets";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { createSecret, deleteSecretByName, listSecrets } from "~/.server/core/secretOperations";
import { paginate } from "~/.server/mcp/responses";

// Vault de secretos de la cuenta (lo mismo que las tools MCP secret_list/set/delete y
// /dash/developer/secrets). Los valores NUNCA salen: sólo nombres y fechas. Se inyectan
// por nombre (`$secret:NOMBRE`, `secretNames` de una máquina, `agent_run({ secrets })`).
// Ruta de recurso: sólo loader/action, sin export default.
//
//   GET    /api/v2/secrets          → { items:[{id,name,createdAt,lastUsedAt}], hasMore, nextCursor, total }
//   POST   /api/v2/secrets          {name, value} → 201 { name, createdAt, … } (mismo nombre = reemplaza)
//   DELETE /api/v2/secrets/:name    → { deleted }
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "READ");
  if (params.name) return Response.json({ error: "Method not allowed" }, { status: 405 });
  const items = await listSecrets(ctx.user.id);
  return Response.json(paginate(items, { total: items.length }));
}

export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  if (request.method === "POST" && !params.name) {
    requireScope(ctx, "WRITE");
    const body = (await request.json().catch(() => ({}))) as { name?: unknown; value?: unknown };
    if (typeof body.name !== "string" || typeof body.value !== "string") {
      return Response.json({ error: "invalid_body", message: "Manda { name, value } como texto." }, { status: 400 });
    }
    try {
      const s = await createSecret(ctx.user.id, { name: body.name, value: body.value });
      return Response.json(s, { status: 201 });
    } catch (e) {
      // Nombre inválido o valor vacío: error del que llama, no del servidor.
      return Response.json({ error: "invalid_secret", message: (e as Error).message }, { status: 400 });
    }
  }
  if (request.method === "DELETE" && params.name) {
    requireScope(ctx, "DELETE");
    const r = await deleteSecretByName(ctx.user.id, params.name);
    if (!r.deleted) return Response.json({ error: "not_found", message: `No hay secreto ${params.name}.` }, { status: 404 });
    return Response.json(r);
  }
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
