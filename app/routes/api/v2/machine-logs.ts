import type { Route } from "./+types/machine-logs";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { readMachineLogs } from "~/.server/core/releaseOperations";

// GET /api/v2/machines/:id/logs?lines=200&grep=texto — el log de LA APP.
// Con unit systemd es su journal; sin unit, el archivo al que se redirige el
// startCommand. Es lo que enseña la pestaña Registro del dashboard.
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);
  const lines = Number(url.searchParams.get("lines") ?? 200);
  const grep = url.searchParams.get("grep") ?? undefined;
  return Response.json(
    await readMachineLogs(ctx, params.id!, {
      lines: Number.isFinite(lines) ? lines : 200,
      grep,
    })
  );
}
