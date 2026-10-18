import type { Route } from "./+types/inboxes";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { createInbox, listInboxes } from "~/.server/core/inboxOperations";

// GET /api/v2/inboxes — tus buzones de eventos (con su URL y los no leídos)
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const items = await listInboxes(ctx);
  return Response.json({ items, nextCursor: null, hasMore: false, total: items.length });
}

// POST /api/v2/inboxes — { name, retentionDays? }
export async function action({ request }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => ({}));
  return Response.json(await createInbox(ctx, body), { status: 201 });
}
