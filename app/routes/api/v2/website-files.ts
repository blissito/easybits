import type { Route } from "./+types/website-files";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { db } from "~/.server/db";

// DELETE /api/v2/websites/:websiteId/files — soft-delete all files for a website (used before re-deploy)
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "DELETE");

  const website = await db.website.findUnique({
    where: { id: params.websiteId! },
  });

  if (!website || website.ownerId !== ctx.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const result = await db.file.updateMany({
    where: {
      ownerId: ctx.user.id,
      name: { startsWith: website.prefix },
      status: { not: "DELETED" },
    },
    data: { status: "DELETED", deletedAt: new Date() },
  });

  return Response.json({ ok: true, deleted: result.count });
}
