import type { Route } from "./+types/document-page-element";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import {
  getSectionHtml,
  setSectionHtmlBySelector,
} from "~/.server/core/documentOperations";

// GET /api/v2/documents/:id/pages/:pageId/element?selector=.hero
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);
  const selector = url.searchParams.get("selector");
  if (!selector) {
    return Response.json({ error: "selector query param required" }, { status: 400 });
  }
  const result = await getSectionHtml(ctx, params.id!, params.pageId!, selector);
  return Response.json(result);
}

// PATCH /api/v2/documents/:id/pages/:pageId/element?selector=.hero
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "PATCH") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "WRITE");

  const url = new URL(request.url);
  const selector = url.searchParams.get("selector");
  if (!selector) {
    return Response.json({ error: "selector query param required" }, { status: 400 });
  }

  const body = await request.json();
  if (typeof body.html !== "string") {
    return Response.json({ error: "html string required" }, { status: 400 });
  }

  const result = await setSectionHtmlBySelector(ctx, params.id!, params.pageId!, selector, body.html);
  return Response.json(result);
}
