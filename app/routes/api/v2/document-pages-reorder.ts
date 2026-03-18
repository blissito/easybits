import type { Route } from "./+types/document-pages-reorder";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { reorderPages } from "~/.server/core/documentOperations";

// PUT /api/v2/documents/:id/pages/reorder
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "PUT") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "WRITE");

  const body = await request.json();
  if (!Array.isArray(body.pageIds)) {
    return Response.json({ error: "pageIds array required" }, { status: 400 });
  }

  const result = await reorderPages(ctx, params.id!, body.pageIds);
  return Response.json(result);
}
