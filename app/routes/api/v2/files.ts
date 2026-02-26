import type { Route } from "./+types/files";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import {
  listFiles,
  listDeletedFiles,
  uploadFile,
} from "~/.server/core/operations";

// GET /api/v2/files
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);
  const assetId = url.searchParams.get("assetId") || undefined;
  const limit = Number(url.searchParams.get("limit")) || 50;
  const cursor = url.searchParams.get("cursor") || undefined;

  const status = url.searchParams.get("status");
  if (status === "DELETED") {
    const result = await listDeletedFiles(ctx, { limit, cursor });
    return Response.json(result);
  }

  const result = await listFiles(ctx, { assetId, limit, cursor });
  return Response.json(result);
}

// POST /api/v2/files
export async function action({ request }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "POST") {
    const body = await request.json();
    const result = await uploadFile(ctx, {
      fileName: body.fileName,
      contentType: body.contentType,
      size: body.size,
      assetId: body.assetId,
      access: body.access,
      region: body.region,
      source: body.source,
    });
    return Response.json(result, { status: 201 });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
