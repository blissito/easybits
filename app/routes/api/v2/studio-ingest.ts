import type { Route } from "./+types/studio-ingest";
import { ingestRecording } from "~/.server/core/studioOperations";

// POST /api/v2/studio/ingest
//
// El box livekit-svc lo llama al parar una grabación (botón de la sala) para
// persistirla en los Files del dueño. Auth = el embedToken del box (Bearer),
// que también es su ADMIN_TOKEN; easybits resuelve el agente→dueño y sube el
// MP4 (jalándolo del box) + encola el transcript. NO usa la API key del dueño.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  let body: { file?: string; bytes?: number; ownerId?: string; sandboxId?: string } = {};
  try { body = await request.json(); } catch { /* empty */ }
  if (!token || !body.file) {
    return Response.json({ error: "token + file required" }, { status: 400 });
  }
  try {
    const r = await ingestRecording(
      token,
      String(body.file),
      Number(body.bytes) || 0,
      body.ownerId ? String(body.ownerId) : undefined,
      body.sandboxId ? String(body.sandboxId) : undefined,
    );
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: String((e as Error).message || e) }, { status: 500 });
  }
}
