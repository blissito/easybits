import type { Route } from "./+types/agent-mcps";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import {
  registerAgentMcp,
  type RegisterMcpBody,
} from "~/.server/core/agentMcpsOperations";

// POST /api/v2/agents/:id/mcps
//
// Owner-only. JSON body: { server, config }
// Forwards to the openclaw runtime gateway (POST :port/mcps) which persists
// the MCP server registration for the agent's tool dispatch.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  let body: RegisterMcpBody;
  try {
    body = (await request.json()) as RegisterMcpBody;
  } catch {
    return Response.json({ error: "JSON body required" }, { status: 400 });
  }
  try {
    const result = await registerAgentMcp(ctx, params.id!, body);
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal error";
    const status = msg.includes("not found")
      ? 404
      : msg.includes("unavailable") ||
          msg.includes("required") ||
          msg.includes("must")
        ? 400
        : 502;
    return Response.json({ error: msg }, { status });
  }
}
