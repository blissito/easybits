/**
 * GET  /api/v2/collab/:docId/state  → Yjs binary state (200 octet-stream) or 204
 * PUT  /api/v2/collab/:docId/state  → store Yjs binary state (body = octet-stream)
 * Auth: Bearer COLLAB_SECRET (server-to-server; the collab-svc box calls this).
 *
 * Externalizes the Yjs document state to private storage (Tigris) keyed by
 * landingId so it survives the ephemeral collab box being suspended/destroyed by
 * the reaper. The box's Hocuspocus Database extension calls GET on load and PUT
 * (debounced) on change. This is durability ONLY — the human-readable HTML lives
 * in Landing.sections, written separately by the editor's per-section persist.
 */
import type { Route } from "./+types/collab.$docId.state";
import { getPlatformDefaultClient } from "~/.server/storage";

const MAX_STATE_BYTES = 20 * 1024 * 1024; // 20MB ceiling for a doc's Yjs state

function key(docId: string) {
  return `collab/${docId}.yjs`;
}

function checkSecret(request: Request): boolean {
  const secret = process.env.COLLAB_SECRET;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!checkSecret(request)) return new Response("unauthorized", { status: 401 });
  const docId = params.docId;
  if (!docId) return new Response("missing docId", { status: 400 });

  const client = getPlatformDefaultClient();
  try {
    const url = await client.getReadUrl(key(docId));
    const r = await fetch(url);
    if (!r.ok) return new Response(null, { status: 204 }); // no prior state → fresh doc
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.byteLength) return new Response(null, { status: 204 });
    return new Response(buf, {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
  } catch {
    return new Response(null, { status: 204 });
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  if (!checkSecret(request)) return new Response("unauthorized", { status: 401 });
  if (request.method !== "PUT") return new Response("method not allowed", { status: 405 });
  const docId = params.docId;
  if (!docId) return new Response("missing docId", { status: 400 });

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.byteLength > MAX_STATE_BYTES) return new Response("state too large", { status: 413 });

  const client = getPlatformDefaultClient();
  await client.putObject(key(docId), buf, "application/octet-stream");
  return new Response(JSON.stringify({ ok: true, bytes: buf.byteLength }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
