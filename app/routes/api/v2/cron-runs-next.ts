import type { Route } from "./+types/cron-runs-next";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { waitUserCronRun, WAIT_MAX_S } from "~/.server/core/userCronOperations";

// GET /api/v2/crons/:id/runs/next?wait=50&after=ISO — long-poll: la siguiente ejecución que TERMINE
// (con logs). Si se acaba `wait` sin ejecución, `run: null`: vuelve a llamar con el `after` devuelto.
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const q = new URL(request.url).searchParams;
  const wait = Number(q.get("wait") ?? WAIT_MAX_S);
  return Response.json(
    await waitUserCronRun(ctx, params.id!, { after: q.get("after") ?? undefined, waitS: Number.isFinite(wait) ? wait : WAIT_MAX_S })
  );
}
