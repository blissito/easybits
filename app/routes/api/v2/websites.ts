import type { Route } from "./+types/websites";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { updateWebsite } from "~/.server/core/operations";

// PATCH /api/v2/websites/:websiteId — update website after deploy
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "PATCH") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "WRITE");

  const body = await request.json();
  const updated = await updateWebsite(ctx, params.websiteId, {
    status: typeof body.status === "string" ? body.status : undefined,
  });

  return Response.json({ ok: true, website: updated });
}
