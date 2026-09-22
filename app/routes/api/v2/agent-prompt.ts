import type { Route } from "./+types/agent-prompt";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getAgentPrompt } from "~/.server/core/sandboxOperations";

// GET /api/v2/agents/:id/prompt — la identidad vigente del agente (ghosty-lite / goose):
// { systemPrompt, systemPromptMode }. Para cambiarla: PATCH /api/v2/agents/:id.
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  try {
    return Response.json(await getAgentPrompt(ctx, params.id!));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/agent not found/i.test(msg)) return Response.json({ error: "agent not found" }, { status: 404 });
    if (/no expone el system prompt/.test(msg)) return Response.json({ error: msg }, { status: 400 });
    throw e;
  }
}
