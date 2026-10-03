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
    const body = await request.json().catch(() => ({}));
    // `slug` presente pero no-string → slug_invalid (lo decide checkWebsiteSlug).
    if (body.slug !== undefined && typeof body.slug !== "string") {
      return Response.json({ error: "slug_invalid", message: "slug must be a string" }, { status: 400 });
    }
    const updated = await updateWebsite(ctx, params.websiteId!, {
      status: typeof body.status === "string" ? body.status : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
      slug: typeof body.slug === "string" ? body.slug : undefined,
    });
    return Response.json({ ok: true, website: updated });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
