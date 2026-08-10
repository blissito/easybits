import type { Route } from "./+types/machine-releases";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { listReleases, publishRelease } from "~/.server/core/releaseOperations";

// GET /api/v2/machines/:id/releases — published releases, newest first.
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);
  const result = await listReleases(ctx, {
    sandboxId: params.id,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  return Response.json(result);
}

// POST /api/v2/machines/:id/releases — publish the current app code as a release.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "create");
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  return Response.json(await publishRelease(ctx, params.id, { message: body?.message }));
}
