import type { Route } from "./+types/character";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import {
  getCharacter,
  updateCharacter,
  deleteCharacter,
} from "~/.server/core/characterOperations";

export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  if (!params.id) return Response.json({ error: "id required" }, { status: 400 });
  const character = await getCharacter(params.id, ctx.user.id);
  return Response.json({ character });
}

export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  if (!params.id) return Response.json({ error: "id required" }, { status: 400 });

  if (request.method === "DELETE") {
    await deleteCharacter(params.id, ctx.user.id);
    return Response.json({ ok: true });
  }

  if (request.method === "PATCH") {
    const body = await request.json().catch(() => ({}));
    try {
      const character = await updateCharacter(params.id, ctx.user.id, body);
      return Response.json({ character });
    } catch (err: any) {
      return Response.json({ error: err?.message || "Failed to update character" }, { status: 400 });
    }
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
