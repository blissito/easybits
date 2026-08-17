import type { Route } from "./+types/icons";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { consumeService } from "~/.server/services/consume";
import type { IconSearchOutput } from "~/.server/services/providers/icons";

/**
 * GET /api/v2/icons?q=<query>&style=&limit=
 *
 * Devuelve candidatos con el SVG INLINE. Solo lectura (no escribe Files) y 0
 * créditos, así que basta con scope READ.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  if (!query) {
    return Response.json({ error: "Query parameter 'q' is required" }, { status: 400 });
  }
  const limitRaw = url.searchParams.get("limit");
  const result = await consumeService<IconSearchOutput>(
    "icon.iconify.search",
    {
      query,
      style: url.searchParams.get("style") || undefined,
      limit: limitRaw ? Number(limitRaw) : undefined,
    },
    { userId: ctx.user.id }
  );
  return Response.json(result.data);
}
