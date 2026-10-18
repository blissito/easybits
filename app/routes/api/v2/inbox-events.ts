import type { Route } from "./+types/inbox-events";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { readInboxEvents } from "~/.server/core/inboxOperations";

// GET /api/v2/inboxes/:id/events?since=&limit=&ack= — sin `since`, lo NO leído; `ack` (default 1)
// mueve el cursor del buzón para que la siguiente lectura traiga sólo lo nuevo.
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const q = new URL(request.url).searchParams;
  const num = (k: string) => (q.get(k) != null && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : undefined);
  const ack = q.get("ack");
  return Response.json(
    await readInboxEvents(ctx, params.id!, { since: num("since"), limit: num("limit"), ack: ack == null ? true : ack === "1" || ack === "true" })
  );
}
