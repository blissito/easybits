import type { Route } from "./+types/file-share-token";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { generateShareToken } from "~/.server/core/operations";

// POST /api/v2/files/:fileId/share-token
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json().catch(() => ({}));
  const result = await generateShareToken(ctx, {
    fileId: params.fileId!,
    expiresIn: body.expiresIn,
    source: "sdk",
  });
  return Response.json(result, { status: 201 });
}
