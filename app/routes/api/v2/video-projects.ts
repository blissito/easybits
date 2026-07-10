import type { Route } from "./+types/video-projects";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { listVideoProjects, createVideoProject } from "~/.server/core/videoProjectOperations";

// GET  /api/v2/video-projects            — list the owner's projects
// POST /api/v2/video-projects            — create a project
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);
  const result = await listVideoProjects(ctx, {
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
    offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    status: url.searchParams.get("status") || undefined,
  });
  return Response.json(result);
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json().catch(() => ({}));
  const project = await createVideoProject(ctx, body);
  return Response.json({ project });
}
