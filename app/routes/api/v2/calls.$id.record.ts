import type { Route } from "./+types/calls.$id.record";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { startStudioRecording } from "~/.server/core/studioOperations";

// POST /api/v2/calls/:id/record  { room }  → { recording, startedAt }
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json().catch(() => ({})) as { room?: string };
  if (!body.room) return Response.json({ error: "room required" }, { status: 400 });
  const result = await startStudioRecording(ctx, params.id, body.room);
  return Response.json(result);
}
