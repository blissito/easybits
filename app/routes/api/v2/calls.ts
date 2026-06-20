import type { Route } from "./+types/calls";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { spawnStudio } from "~/.server/core/studioOperations";

// POST /api/v2/calls  { room? }  → { sandboxId, room, roomUrl }
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json().catch(() => ({})) as { room?: string };
  const result = await spawnStudio(ctx, body.room);
  return Response.json(result);
}
