import type { Route } from "./+types/keys";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { createApiKey, listApiKeys, mintableScopes } from "~/.server/iam";

// GET /api/v2/keys
export async function loader({ request }: Route.LoaderArgs) {
  // authenticateRequest acepta cookie de sesión (dashboard), API key Y Bearer
  // OAuth — superset de getUserOrNull, así el SSO puede mintear con su token.
  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "READ");
  // Una key de workspace sólo ve lo de su workspace: las keys de la cuenta no.
  if (ctx.workspaceId) return Response.json({ error: "Workspace-scoped keys cannot manage account keys" }, { status: 403 });
  const keys = await listApiKeys(ctx.user.id);
  return Response.json({ keys });
}

// POST /api/v2/keys
export async function action({ request }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "POST") {
    requireScope(ctx, "WRITE");
    if (ctx.workspaceId) return Response.json({ error: "Workspace-scoped keys cannot mint account keys" }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    // Sin escalar: la key nueva nunca lleva más scopes que la credencial que la crea.
    const allowed = mintableScopes(ctx.scopes, body.scopes);
    if ("error" in allowed) return Response.json({ error: allowed.error }, { status: 400 });
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return Response.json({ error: "expiresAt must be an ISO date" }, { status: 400 });
    }
    const key = await createApiKey(ctx.user.id, {
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Unnamed key",
      scopes: allowed.scopes,
      expiresAt,
    });
    return Response.json(key, { status: 201 });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
