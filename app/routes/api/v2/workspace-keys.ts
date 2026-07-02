import type { Route } from "./+types/workspace-keys";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { createWorkspaceKey } from "~/.server/core/operations";

// POST /api/v2/workspaces/:workspaceId/keys — mint a workspace-scoped API key.
// The raw key is returned exactly once; store it immediately.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json().catch(() => ({}));
  const scopes = Array.isArray(body.scopes)
    ? body.scopes.filter((s: unknown): s is "READ" | "WRITE" | "DELETE" =>
        s === "READ" || s === "WRITE" || s === "DELETE"
      )
    : undefined;
  const result = await createWorkspaceKey(ctx, params.workspaceId!, {
    name: typeof body.name === "string" ? body.name : undefined,
    scopes: scopes && scopes.length ? scopes : undefined,
  });
  return Response.json(result);
}
