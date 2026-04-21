import type { Route } from "./+types/video";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getVideoGeneration, deleteVideoGeneration } from "~/.server/core/videoOperations";

export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  if (!params.id) return Response.json({ error: "id required" }, { status: 400 });
  const row = await getVideoGeneration(params.id, ctx.user.id);
  return Response.json({ video: row });
}

export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  if (!params.id) return Response.json({ error: "id required" }, { status: 400 });
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  await deleteVideoGeneration(params.id, ctx.user.id);
  return Response.json({ ok: true });
}
