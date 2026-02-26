import type { Route } from "./+types/websites";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { getWebsite, updateWebsite, deleteWebsite } from "~/.server/core/operations";

// GET /api/v2/websites/:websiteId
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const website = await getWebsite(ctx, params.websiteId!);
  return Response.json(website);
}

// PATCH or DELETE /api/v2/websites/:websiteId
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "DELETE") {
    requireScope(ctx, "DELETE");
    const result = await deleteWebsite(ctx, params.websiteId!);
    return Response.json(result);
  }

  if (request.method === "PATCH") {
    requireScope(ctx, "WRITE");
    const body = await request.json();
    const updated = await updateWebsite(ctx, params.websiteId!, {
      status: typeof body.status === "string" ? body.status : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
    });
    return Response.json({ ok: true, website: updated });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
