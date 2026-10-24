import type { Route } from "./+types/sites.$id.engine";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { setSiteEngine } from "~/.server/core/siteOperations";

// POST /api/v2/sites/:id/engine {engine?, model?, secretValue?} — cambia con qué se construye el
// sitio (la pastilla del editor, el SDK, la CLI y el MCP site_set_engine pasan por aquí). El motor es
// del sitio; el modelo es del builder de ese motor y vale para todos los sitios de la cuenta con ese
// motor desde el siguiente turno. Ruta de recurso: sin export default.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const ctx = requireAuth(await authenticateRequest(request));
  const body = (await request.json().catch(() => ({}))) as { engine?: unknown; model?: unknown; secretValue?: unknown };
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  try {
    return Response.json(await setSiteEngine(ctx, params.id!, { engine: str(body.engine), model: str(body.model), secretValue: str(body.secretValue) }));
  } catch (e) {
    if (e instanceof Response) return Response.json({ error: await e.text().catch(() => e.statusText) }, { status: e.status });
    throw e;
  }
}
