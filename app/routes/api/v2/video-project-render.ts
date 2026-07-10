import type { Route } from "./+types/video-project-render";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { renderVideoProject } from "~/.server/core/videoProjectOperations";

// POST /api/v2/video-projects/:id/render
// Compiles the project to a HyperFrames bundle and renders it to MP4 on the
// owner's on-demand box (synthesizing narration first). Synchronous — a short
// video renders in tens of seconds.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST")
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  const ctx = requireAuth(await authenticateRequest(request));
  try {
    return Response.json(await renderVideoProject(ctx, params.id!));
  } catch (err: any) {
    if (err instanceof Response) throw err;
    return Response.json({ error: err?.message || "Render failed" }, { status: 502 });
  }
}
