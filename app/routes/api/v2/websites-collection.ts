import type { Route } from "./+types/websites-collection";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { createWebsite, listWebsites } from "~/.server/core/operations";

// GET /api/v2/websites — list websites
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const websites = await listWebsites(ctx);
  return Response.json({ items: websites });
}

// POST /api/v2/websites — create a website
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "WRITE");

  const body = await request.json();
  const name = String(body.name || "").trim();
  if (!name) {
    return Response.json({ error: "Name required" }, { status: 400 });
  }

  const website = await createWebsite(ctx, { name });
  return Response.json({ website });
}
