import type { Route } from "./+types/document";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import {
  getDocument,
  updateDocument,
  deleteDocument,
} from "~/.server/core/documentOperations";

// GET /api/v2/documents/:id
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const document = await getDocument(ctx, params.id!);
  return Response.json(document);
}

// PATCH or DELETE /api/v2/documents/:id
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "DELETE") {
    requireScope(ctx, "DELETE");
    const result = await deleteDocument(ctx, params.id!);
    return Response.json(result);
  }

  if (request.method === "PATCH") {
    requireScope(ctx, "WRITE");
    const body = await request.json();
    const updated = await updateDocument(ctx, params.id!, {
      name: body.name,
      prompt: body.prompt,
      sections: body.sections,
      theme: body.theme,
      customColors: body.customColors,
    });
    return Response.json({ document: updated });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
