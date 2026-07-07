/**
 * GET   /api/v2/artifacts/:id  — estado del artefacto (identidad + versión actual).
 * PATCH /api/v2/artifacts/:id  — edit-in-place: aplica contenido nuevo → NUEVA versión.
 * Auth: owner. Body PATCH: { markdown?, html? } → { ok, artifactId, kind, version }
 */
import type { Route } from "./+types/artifacts.$id";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getArtifact, updateArtifact } from "~/.server/core/artifactOperations";

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function ok(data: unknown) {
  return new Response(JSON.stringify({ ok: true, ...(data as object) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  try {
    return ok(await getArtifact(ctx, params.id));
  } catch (e) {
    return bad(`not found: ${e instanceof Error ? e.message : e}`, 404);
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "PATCH" && request.method !== "POST")
    return bad("method not allowed", 405);
  const ctx = requireAuth(await authenticateRequest(request));
  let body: { markdown?: string; html?: string };
  try {
    body = await request.json();
  } catch {
    return bad("bad body");
  }
  if (!body.markdown && !body.html) return bad("markdown o html requerido");
  try {
    return ok(await updateArtifact(ctx, params.id, body));
  } catch (e) {
    return bad(`update falló: ${e instanceof Error ? e.message : e}`, 500);
  }
}
