import type { Route } from "./+types/brand-kits";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import {
  listBrandKits,
  createBrandKit,
} from "~/.server/core/brandKitOperations";

export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const kits = await listBrandKits(ctx.user.id);
  return Response.json(kits);
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json();
  if (!body.name || !body.colors) {
    return Response.json({ error: "name and colors required" }, { status: 400 });
  }
  const kit = await createBrandKit(ctx.user.id, body);
  return Response.json(kit, { status: 201 });
}
