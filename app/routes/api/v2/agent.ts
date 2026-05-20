import type { Route } from "./+types/agent";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { destroyAgent, getAgent } from "~/.server/core/sandboxOperations";

// GET /api/v2/agents/:id — owner-only agent record
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  try {
    const result = await getAgent(ctx, params.id!);
    return Response.json(result);
  } catch (e) {
    // Agente inexistente/borrado: getAgent lanza Error("agent not found").
    // Devolvemos 404 (no 500) para que los clientes (ghosty.studio) puedan
    // distinguir "no existe" de un fallo real y redirigir en lugar de tronar.
    if (e instanceof Error && /agent not found/i.test(e.message)) {
      return Response.json({ error: "agent not found" }, { status: 404 });
    }
    throw e;
  }
}

// DELETE /api/v2/agents/:id — destroys the underlying sandbox + Agent row
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await destroyAgent(ctx, params.id!);
  return Response.json(result);
}
