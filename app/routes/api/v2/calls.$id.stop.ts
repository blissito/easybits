import type { Route } from "./+types/calls.$id.stop";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { stopStudioRecording } from "~/.server/core/studioOperations";

// POST /api/v2/calls/:id/stop  → { url, fileId }
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await stopStudioRecording(ctx, params.id);
  return Response.json(result);
}
