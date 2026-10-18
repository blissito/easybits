import type { Route } from "./+types/inbox";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { deleteInbox, getInbox, rotateInboxToken, updateInbox } from "~/.server/core/inboxOperations";

// GET /api/v2/inboxes/:id (id o nombre)
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  if (params.op) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(await getInbox(ctx, params.id!));
}

// PATCH { name?, retentionDays? } · DELETE · POST /api/v2/inboxes/:id/rotate (URL nueva)
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  if (request.method === "PATCH") return Response.json(await updateInbox(ctx, params.id!, await request.json().catch(() => ({}))));
  if (request.method === "DELETE") return Response.json(await deleteInbox(ctx, params.id!));
  if (request.method === "POST" && params.op === "rotate") return Response.json(await rotateInboxToken(ctx, params.id!));
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
