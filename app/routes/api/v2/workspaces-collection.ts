import type { Route } from "./+types/workspaces-collection";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { createWorkspace, listWorkspaces } from "~/.server/core/operations";

// GET /api/v2/workspaces — list workspaces (cursor paginated)
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit")) || undefined;
  const cursor = url.searchParams.get("cursor") || undefined;
  const result = await listWorkspaces(ctx, { limit, cursor });
  return Response.json(result);
}

// POST /api/v2/workspaces — create a workspace
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "WRITE");

  const body = await request.json();
  const name = String(body.name || "").trim();
  if (!name) {
    return Response.json({ error: "Name required" }, { status: 400 });
  }

  const workspace = await createWorkspace(ctx, {
    name,
    slug: typeof body.slug === "string" ? body.slug : undefined,
    quotaBytes: typeof body.quotaBytes === "number" ? body.quotaBytes : undefined,
  });
  return Response.json({ workspace });
}
