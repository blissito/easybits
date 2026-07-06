/**
 * GET /api/v2/collab/:token/room
 *
 * Client-facing (the collaborative editor calls it on mount). Validates the
 * share `token` (must be an EDIT link on a document), then spawns/resumes the
 * OWNER's collab box (Hocuspocus) and returns its ws URL + the room id (docId).
 * The editor connects its HocuspocusProvider to `{ wsUrl, room=docId, token }`.
 *
 * Kept OUT of the page loader on purpose: a cold box spawn is ~seconds, so the
 * editor renders immediately with a "conectando…" state and calls this async.
 */
import type { Route } from "./+types/collab.$token.room";
import { verifyShareToken } from "~/.server/shareLinks";
import { ensureCollabBoxForOwner } from "~/.server/core/fleetCollab";

function bad(msg: string, status = 401) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function loader({ params }: Route.LoaderArgs) {
  const token = params.token;
  if (!token) return bad("missing token", 400);

  const res = await verifyShareToken(token);
  if (!res.ok) return bad(`invalid share token: ${res.reason}`, 401);
  const { link } = res;
  if (link.resourceType !== "document" || res.payload.perm !== "edit") {
    return bad("token is not a document edit link", 403);
  }

  try {
    const box = await ensureCollabBoxForOwner(link.ownerId);
    return new Response(
      JSON.stringify({ ok: true, wsUrl: box.wsUrl, room: link.resourceId }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (e) {
    return bad(`collab box unavailable: ${(e as Error).message}`, 503);
  }
}
