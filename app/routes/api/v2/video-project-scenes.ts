import type { Route } from "./+types/video-project-scenes";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { addScene, reorderScenes } from "~/.server/core/videoProjectOperations";

// POST /api/v2/video-projects/:id/scenes          — add a scene
// PUT  /api/v2/video-projects/:id/scenes          — reorder (body.sceneIds)
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json().catch(() => ({}));
  if (request.method === "PUT") {
    return Response.json({ scenes: await reorderScenes(ctx, params.id!, body.sceneIds || []) });
  }
  if (request.method === "POST") {
    return Response.json(await addScene(ctx, params.id!, body));
  }
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
