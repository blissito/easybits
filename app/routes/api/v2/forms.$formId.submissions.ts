import type { Route } from "./+types/forms.$formId.submissions";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { listFormSubmissions } from "~/.server/core/formOperations";

// GET /api/v2/forms/:formId/submissions — list submissions for a form
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit")) || 50;
  const result = await listFormSubmissions(ctx, params.formId, limit);
  return Response.json(result);
}
