import type { Route } from "./+types/agent";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { destroyAgent, getAgent } from "~/.server/core/sandboxOperations";

// GET /api/v2/agents/:id — owner-only agent record
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await getAgent(ctx, params.id!);
  return Response.json(result);
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
