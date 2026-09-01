import type { Route } from "./+types/sandbox-bg-detail";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import {
  execBackgroundStatus,
  execBackgroundKill,
} from "~/.server/core/sandboxOperations";

// GET /api/v2/sandboxes/:id/bg/:execId — status + captured logs
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(
    ctx.apiKey?.id ?? ctx.user.id,
    "op"
  );
  if (limited) return limited;
  return Response.json(
    await execBackgroundStatus(ctx, params.id, params.execId)
  );
}

// DELETE (o POST) /api/v2/sandboxes/:id/bg/:execId — kill the background process
//
// POST se acepta como alias porque los docs lo publicaron así durante meses
// (reference.ts documentaba `POST .../bg/:execId/kill`) y un agente que leyó
// eso recibía un 405 sin explicación. DELETE sigue siendo la forma canónica.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "DELETE" && request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(
    ctx.apiKey?.id ?? ctx.user.id,
    "op"
  );
  if (limited) return limited;
  // graceSeconds: cuánto esperar entre SIGTERM y SIGKILL (0-30).
  const grace = new URL(request.url).searchParams.get("graceSeconds");
  return Response.json(
    await execBackgroundKill(ctx, params.id, params.execId, {
      graceSeconds: grace === null ? undefined : Number(grace),
    })
  );
}
