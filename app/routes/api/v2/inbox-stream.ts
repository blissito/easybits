import type { Route } from "./+types/inbox-stream";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { openInboxStream } from "~/.server/core/inboxOperations";

// GET /api/v2/inboxes/:id/events/stream?since= — SSE: `event: inbox` por evento (id = seq), en
// vivo. Sin `since` empieza por lo no leído. Reconecta con Last-Event-ID o ?since=<último seq>.
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const q = new URL(request.url).searchParams.get("since") ?? request.headers.get("last-event-id");
  const since = q != null && Number.isFinite(Number(q)) ? Number(q) : undefined;
  const stream = await openInboxStream(ctx, params.id!, { since, signal: request.signal });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
