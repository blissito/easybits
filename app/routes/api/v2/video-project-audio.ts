import type { Route } from "./+types/video-project-audio";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { setVideoAudio, attachVideoAsset } from "~/.server/core/videoProjectOperations";

// POST /api/v2/video-projects/:id/audio   — set/clear background music (body.url|null, body.name)
// PUT  /api/v2/video-projects/:id/audio   — attach a named asset (body.url, body.name, body.type)
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json().catch(() => ({}));
  if (request.method === "PUT") {
    return Response.json(await attachVideoAsset(ctx, params.id!, body));
  }
  if (request.method === "POST") {
    return Response.json(await setVideoAudio(ctx, params.id!, body));
  }
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
