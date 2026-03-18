import type { Route } from "./+types/website-files";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { listWebsiteFiles, uploadWebsiteFile } from "~/.server/core/operations";

// GET /api/v2/websites/:websiteId/files — list files for a website
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "READ");

  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined;
  const cursor = url.searchParams.get("cursor") || undefined;

  const result = await listWebsiteFiles(ctx, params.websiteId!, { limit, cursor });
  return Response.json(result);
}

// POST /api/v2/websites/:websiteId/files — upload a file for a website
// DELETE /api/v2/websites/:websiteId/files — soft-delete all files for a website
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method === "POST") {
    const ctx = requireAuth(await authenticateRequest(request));
    const body = await request.json();

    const { fileName, contentType, size, access } = body;
    if (!fileName || !contentType || !size) {
      return Response.json({ error: "fileName, contentType, and size are required" }, { status: 400 });
    }

    const result = await uploadWebsiteFile(ctx, {
      websiteId: params.websiteId!,
      fileName,
      contentType,
      size: Number(size),
      access,
    });

    return Response.json(result, { status: 201 });
  }

  if (request.method === "DELETE") {
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

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
