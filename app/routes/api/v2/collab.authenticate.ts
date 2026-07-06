/**
 * POST /api/v2/collab/authenticate
 * Auth: Bearer COLLAB_SECRET (server-to-server; the collab-svc box calls this).
 * Body: { token: string, documentName: string }
 *
 * Called by the Hocuspocus box's onAuthenticate hook. Validates that the share
 * `token` grants EDIT on the document `documentName` (= landingId). Returns 200
 * `{ ok, landingId, ownerId }` when authorized, 401/403 otherwise. This is the
 * gate that stops anyone with the box ws URL from editing arbitrary docs.
 */
import type { Route } from "./+types/collab.authenticate";
import { verifyShareToken } from "~/.server/shareLinks";

function unauthorized(msg: string, status = 401) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return unauthorized("method not allowed", 405);

  const secret = process.env.COLLAB_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) return unauthorized("bad box secret", 401);

  let body: { token?: string; documentName?: string };
  try {
    body = await request.json();
  } catch {
    return unauthorized("bad body", 400);
  }
  const { token, documentName } = body;
  if (!token || !documentName) return unauthorized("missing token/documentName", 400);

  const res = await verifyShareToken(token);
  if (!res.ok) return unauthorized(`invalid share token: ${res.reason}`, 401);

  const { payload, link } = res;
  // Must be an EDIT link on THIS document.
  if (payload.rt !== "document" || payload.perm !== "edit") {
    return unauthorized("token is not a document edit link", 403);
  }
  if (String(payload.rid) !== String(documentName)) {
    return unauthorized("token does not authorize this document", 403);
  }

  return new Response(
    JSON.stringify({ ok: true, landingId: payload.rid, ownerId: link.ownerId }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
