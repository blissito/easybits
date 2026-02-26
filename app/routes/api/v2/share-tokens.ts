import type { Route } from "./+types/share-tokens";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { listShareTokens } from "~/.server/core/operations";

// GET /api/v2/share-tokens
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);
  const fileId = url.searchParams.get("fileId") || undefined;
  const limit = Number(url.searchParams.get("limit")) || 50;
  const cursor = url.searchParams.get("cursor") || undefined;

  const result = await listShareTokens(ctx, { fileId, limit, cursor });
  return Response.json(result);
}
