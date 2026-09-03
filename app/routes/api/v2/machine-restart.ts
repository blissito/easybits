import type { Route } from "./+types/machine-restart";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { restartMachine } from "~/.server/core/releaseOperations";

// POST /api/v2/machines/:id/restart — reinicia el proceso de la app con los
// secretos y el runspec actuales. Segundos, sin descargar ni construir nada.
//
// Existe para cerrar un lote de `PUT /secrets?restart=false` sin tener que
// escribir un secreto de mentira sólo para provocar el reinicio.
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "op");
  if (limited) return limited;

  try {
    return Response.json(await restartMachine(ctx, params.id!));
  } catch (e: any) {
    if (e instanceof Response) return e;
    return Response.json(
      { error: e?.code ?? "RestartFailed", message: String(e?.message ?? e) },
      { status: e?.status ?? 400 }
    );
  }
}
