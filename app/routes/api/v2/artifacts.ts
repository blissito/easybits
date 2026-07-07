/**
 * POST /api/v2/artifacts   — crea un artefacto (Fase 1: kind "doc").
 * Auth: owner (OAuth bearer / platform key).
 * Body: { kind?: "doc", title?, markdown?, html? } → { ok, artifactId, kind, version, title }
 *
 * Trinidad del sistema de artefactos: la tool MCP `artifact` y el SDK reusan este core
 * (artifactOperations). Ver plan fuzzy-wibbling-allen.
 */
import type { Route } from "./+types/artifacts";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { createArtifact } from "~/.server/core/artifactOperations";

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return bad("method not allowed", 405);
  const ctx = requireAuth(await authenticateRequest(request));
  let body: { kind?: "doc"; title?: string; markdown?: string; html?: string };
  try {
    body = await request.json();
  } catch {
    return bad("bad body");
  }
  if (!body.markdown && !body.html) return bad("markdown o html requerido");
  try {
    const ref = await createArtifact(ctx, body);
    return new Response(JSON.stringify({ ok: true, ...ref }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return bad(`create falló: ${e instanceof Error ? e.message : e}`, 500);
  }
}
