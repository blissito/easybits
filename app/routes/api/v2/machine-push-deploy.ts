import type { Route } from "./+types/machine-push-deploy";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import {
  disablePushDeploy,
  enablePushDeploy,
  getPushDeployStatus,
} from "~/.server/core/pushDeployOperations";

// GET    /api/v2/machines/:id/push-deploy — ¿está encendido?, URL y repo.
// POST   /api/v2/machines/:id/push-deploy — lo enciende (o rota el secreto) y
//        devuelve la URL + secreto que se pegan en GitHub → Settings → Webhooks.
// DELETE /api/v2/machines/:id/push-deploy — lo apaga.
function fail(e: any) {
  if (e instanceof Response) return e;
  return Response.json(
    { error: e?.code ?? "PushDeployFailed", message: String(e?.message ?? e) },
    { status: e?.status ?? 400 }
  );
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  try {
    return Response.json(await getPushDeployStatus(ctx, params.id!));
  } catch (e) {
    return fail(e);
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "op");
  if (limited) return limited;
  try {
    if (request.method === "POST") return Response.json(await enablePushDeploy(ctx, params.id!));
    if (request.method === "DELETE") return Response.json(await disablePushDeploy(ctx, params.id!));
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (e) {
    return fail(e);
  }
}
