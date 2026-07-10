import type { Route } from "./+types/video-project-scene";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { setScene, deleteScene } from "~/.server/core/videoProjectOperations";

// PATCH / DELETE  /api/v2/video-projects/:id/scenes/:sceneId
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  if (request.method === "DELETE") {
    return Response.json(await deleteScene(ctx, params.id!, params.sceneId!));
  }
  if (request.method === "PATCH" || request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    return Response.json(await setScene(ctx, params.id!, params.sceneId!, body));
  }
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
