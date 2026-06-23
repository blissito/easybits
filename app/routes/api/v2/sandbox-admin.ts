import type { Route } from "./+types/sandbox-admin";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { sandboxAdmin } from "~/.server/core/sandboxOperations";

// POST /api/v2/sandbox/:id/admin
//
// Sandbox-surface twin of agent-admin.ts: generic passthrough to the box's
// in-VM admin API (:8787) for a PERMANENT machine hosting a managed runtime
// (e.g. ghostyclaw). Used for WhatsApp pairing (/admin/whatsapp/*) + CLAUDE.md
// CRUD. Authz + owner-resolution + adminToken handled in `sandboxAdmin`
// (owner OR "machines" delegate → 404 otherwise). Body: { method?, path, body? }.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));

  let body: { method?: string; path: string; body?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "JSON body required" }, { status: 400 });
  }

  // sandboxAdmin throws a Response (400/404) on bad path / unauthorized / no token.
  const result = await sandboxAdmin(ctx, params.id!, body);
  return Response.json(result);
}
