import type { Route } from "./+types/calls.$id.destroy";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { stopStudioRecording } from "~/.server/core/studioOperations";
import { destroySandbox } from "~/.server/core/sandboxOperations";

// POST /api/v2/calls/:id/destroy
// Para la grabación si hay una activa, luego destruye el sandbox.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const ctx = requireAuth(await authenticateRequest(request));
  await stopStudioRecording(ctx, params.id).catch(() => {}); // best-effort
  await destroySandbox(ctx, params.id);
  return Response.json({ ok: true });
}
