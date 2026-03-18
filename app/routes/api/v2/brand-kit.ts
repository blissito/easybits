import type { Route } from "./+types/brand-kit";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import {
  updateBrandKit,
  deleteBrandKit,
} from "~/.server/core/brandKitOperations";
import { db } from "~/.server/db";

export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const kit = await db.brandKit.findUnique({ where: { id: params.id! } });
  if (!kit || kit.ownerId !== ctx.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(kit);
}

export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "PATCH") {
    const body = await request.json();
    try {
      const kit = await updateBrandKit(params.id!, ctx.user.id, body);
      return Response.json(kit);
    } catch {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
  }

  if (request.method === "DELETE") {
    try {
      await deleteBrandKit(params.id!, ctx.user.id);
      return Response.json({ ok: true });
    } catch {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
