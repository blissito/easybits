import type { Route } from "./+types/document-deploy";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { deployDocument } from "~/.server/core/documentOperations";

// POST /api/v2/documents/:id/deploy
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await deployDocument(ctx, params.id!);
  return Response.json(result);
}
