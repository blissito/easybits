import type { Route } from "./+types/presentation-deploy";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { deployPresentation } from "~/.server/core/presentationOperations";

// POST /api/v2/presentations/:id/deploy
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await deployPresentation(ctx, params.id!);
  return Response.json(result);
}
