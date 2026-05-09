import type { Route } from "./+types/agent-lost";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { markAgentLost } from "~/.server/core/sandboxOperations";

// POST /api/v2/agents/:id/lost
//
// Owner-only. Lo llama el loader de ghosty.studio cuando un probe al
// agentUrl falló (sandbox subyacente murió). Persiste status=lost +
// expiresAt=now() así los countdowns de UI no mienten y otros
// consumidores ven el estado real sin tener que probear ellos también.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await markAgentLost(ctx, params.id!);
  return Response.json(result);
}
