import type { Route } from "./+types/document-clone";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { cloneDocument } from "~/.server/core/landingOperations";

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json().catch(() => ({}));
  const result = await cloneDocument(ctx, params.id!, body.name);
  return Response.json(result);
}
