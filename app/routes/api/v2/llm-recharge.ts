import type { Route } from "./+types/llm-recharge";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";

/**
 * POST /api/v2/llm/recharge
 *
 * DEPRECATED. Las recargas de tokens LLM ahora se hacen vía packs
 * en /dash/packs con pago Stripe. Este endpoint se mantiene solo
 * para compatibilidad — devuelve un mensaje informativo.
 */
export async function action({ request }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  return Response.json(
    {
      ok: false,
      error: "deprecated",
      message:
        "Las recargas de tokens LLM ahora se compran en /dash/packs. " +
        "Ya no se pueden recargar tokens gratis desde este endpoint.",
    },
    { status: 410 },
  );
}
