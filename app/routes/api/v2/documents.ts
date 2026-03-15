import type { Route } from "./+types/documents";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import {
  listDocuments,
  createDocument,
} from "~/.server/core/documentOperations";

// GET /api/v2/documents
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await listDocuments(ctx);
  return Response.json(result);
}

// POST /api/v2/documents
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "WRITE");

  const body = await request.json();
  const document = await createDocument(ctx, {
    name: String(body.name || ""),
    prompt: body.prompt,
    sections: body.sections,
    theme: body.theme,
    customColors: body.customColors,
  });
  return Response.json({ document });
}
