import type { Route } from "./+types/file-transform";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { transformImage } from "~/.server/core/imageOperations";

// POST /api/v2/files/:fileId/transform
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json();
  const result = await transformImage(ctx, {
    fileId: params.fileId!,
    width: body.width,
    height: body.height,
    fit: body.fit,
    format: body.format,
    quality: body.quality,
    rotate: body.rotate,
    flip: body.flip,
    grayscale: body.grayscale,
  });
  return Response.json(result, { status: 201 });
}
