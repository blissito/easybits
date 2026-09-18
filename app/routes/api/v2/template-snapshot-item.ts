import type { Route } from "./+types/template-snapshot-item";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { deleteTemplateSnapshot, getTemplateSnapshot } from "~/.server/core/sandboxOperations";

// GET /api/v2/template-snapshots/:id — descriptor de una plantilla derivada
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  return Response.json(await getTemplateSnapshot(ctx, { derivedId: params.id }));
}

// DELETE /api/v2/template-snapshots/:id — borra (409 DerivedTemplateInUse si hay hijos vivos)
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "op");
  if (limited) return limited;
  if (request.method === "DELETE") {
    return Response.json(await deleteTemplateSnapshot(ctx, params.id));
  }
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
