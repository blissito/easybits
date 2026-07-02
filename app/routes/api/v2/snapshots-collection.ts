import type { Route } from "./+types/snapshots-collection";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { listSnapshots } from "~/.server/core/sandboxOperations";

// GET /api/v2/snapshots — list the caller's saved snapshots
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  return Response.json({ items: await listSnapshots(ctx) });
}
