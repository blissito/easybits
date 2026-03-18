import type { Route } from "./+types/document-slots";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getTemplateSlots } from "~/.server/core/documentOperations";

export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await getTemplateSlots(ctx, params.id);
  return Response.json(result);
}
