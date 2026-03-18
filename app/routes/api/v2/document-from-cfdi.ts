import type { Route } from "./+types/document-from-cfdi";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { createDocumentFromCFDI } from "~/.server/core/documentOperations";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json();
  const { xml, theme, customColors } = body;

  if (!xml || typeof xml !== "string") {
    return Response.json({ error: "xml string required" }, { status: 400 });
  }

  try {
    const result = await createDocumentFromCFDI(ctx, { xml, theme, customColors });
    return Response.json(result);
  } catch (err) {
    if (err instanceof Response) throw err;
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to parse CFDI" },
      { status: 400 }
    );
  }
}
