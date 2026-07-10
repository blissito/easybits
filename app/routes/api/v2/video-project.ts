import type { Route } from "./+types/video-project";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import {
  getVideoProject,
  updateVideoProject,
  deleteVideoProject,
} from "~/.server/core/videoProjectOperations";

// GET / PATCH / DELETE  /api/v2/video-projects/:id
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  return Response.json(await getVideoProject(ctx, params.id!));
}

export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  if (request.method === "DELETE") {
    return Response.json(await deleteVideoProject(ctx, params.id!));
  }
  if (request.method === "PATCH" || request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    return Response.json({ project: await updateVideoProject(ctx, params.id!, body) });
  }
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
