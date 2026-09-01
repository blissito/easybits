import type { Route } from "./+types/sandbox-bg-kill";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { execBackgroundKill } from "~/.server/core/sandboxOperations";

// POST /api/v2/sandboxes/:id/bg/:execId/kill — alias del DELETE.
//
// Existe porque los docs publicaron ESTA ruta (`app/.server/docs/reference.ts`)
// mientras el código solo aceptaba `DELETE .../bg/:execId`: un agente que siguió
// la documentación recibía un 405 sin pista de por qué. Se acepta también DELETE
// para que las dos escrituras que circulan funcionen.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST" && request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(
    ctx.apiKey?.id ?? ctx.user.id,
    "op"
  );
  if (limited) return limited;
  const grace = new URL(request.url).searchParams.get("graceSeconds");
  return Response.json(
    await execBackgroundKill(ctx, params.id, params.execId, {
      graceSeconds: grace === null ? undefined : Number(grace),
    })
  );
}
