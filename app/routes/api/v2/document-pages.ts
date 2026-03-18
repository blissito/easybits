import type { Route } from "./+types/document-pages";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { addPage } from "~/.server/core/documentOperations";

// POST /api/v2/documents/:id/pages
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "WRITE");

  const body = await request.json();
  const page = await addPage(ctx, params.id!, {
    html: body.html,
    afterPageIndex: body.afterPageIndex,
    label: body.label,
  });
  return Response.json(page);
}
