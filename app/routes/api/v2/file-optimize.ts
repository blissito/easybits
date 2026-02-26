import type { Route } from "./+types/file-optimize";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { optimizeImage } from "~/.server/core/imageOperations";

// POST /api/v2/files/:fileId/optimize
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json();
  const result = await optimizeImage(ctx, {
    fileId: params.fileId!,
    format: body.format,
    quality: body.quality,
  });
  return Response.json(result, { status: 201 });
}
