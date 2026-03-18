import type { Route } from "./+types/document-page";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import {
  getPageHtml,
  setPageHtml,
  deletePage,
} from "~/.server/core/documentOperations";

// GET /api/v2/documents/:id/pages/:pageId
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const page = await getPageHtml(ctx, params.id!, params.pageId!);
  return Response.json(page);
}

// PATCH or DELETE /api/v2/documents/:id/pages/:pageId
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "DELETE") {
    requireScope(ctx, "DELETE");
    const result = await deletePage(ctx, params.id!, params.pageId!);
    return Response.json(result);
  }

  if (request.method === "PATCH") {
    requireScope(ctx, "WRITE");
    const body = await request.json();
    if (typeof body.html !== "string") {
      return Response.json({ error: "html string required" }, { status: 400 });
    }
    const result = await setPageHtml(ctx, params.id!, params.pageId!, body.html);
    return Response.json(result);
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
