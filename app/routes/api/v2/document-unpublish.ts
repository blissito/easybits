import type { Route } from "./+types/document-unpublish";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { unpublishDocument } from "~/.server/core/documentOperations";

// POST /api/v2/documents/:id/unpublish
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await unpublishDocument(ctx, params.id!);
  return Response.json(result);
}
