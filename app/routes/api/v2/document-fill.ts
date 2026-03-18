import type { Route } from "./+types/document-fill";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { fillTemplate } from "~/.server/core/documentOperations";

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json();
  if (!body.data || typeof body.data !== "object") {
    return Response.json({ error: "data object required" }, { status: 400 });
  }
  const result = await fillTemplate(ctx, params.id, body.data);
  return Response.json(result);
}
