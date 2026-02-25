import type { Route } from "./+types/websites";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { db } from "~/.server/db";

// PATCH /api/v2/websites/:websiteId — update stats after deploy
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "PATCH") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "WRITE");

  const websiteId = params.websiteId;
  const website = await db.website.findUnique({ where: { id: websiteId } });

  if (!website || website.ownerId !== ctx.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();

  await db.website.update({
    where: { id: websiteId },
    data: {
      ...(typeof body.fileCount === "number" ? { fileCount: body.fileCount } : {}),
      ...(typeof body.totalSize === "number" ? { totalSize: body.totalSize } : {}),
      ...(typeof body.status === "string" ? { status: body.status } : {}),
    },
  });

  return Response.json({ ok: true });
}
