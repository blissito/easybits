import type { Route } from "./+types/agent-mcps";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { db } from "~/.server/db";
import { MACHINE_TEMPLATES } from "~/.server/core/sandboxOperations";
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
  const limited = await applySandboxRateLimit(
    ctx.apiKey?.id ?? ctx.user.id,
    "op"
  );
  if (limited) return limited;
  let body: RegisterMcpBody;
  try {
    body = (await request.json()) as RegisterMcpBody;
  } catch {
    return Response.json({ error: "JSON body required" }, { status: 400 });
  }
  try {
    // Templates con máquina (ghosty-lite / goose): los MCP viajan en session/new, no por el
    // gateway de openclaw. Antes esto daba 502 sin decir por qué.
    const row = await db.agent.findUnique({ where: { id: params.id! }, select: { template: true } });
    if (row && MACHINE_TEMPLATES.has(row.template)) {
      return Response.json({ error: "este template se configura con PUT /api/v2/agents/:id/mcp { servers } (reemplaza la lista y reinicia)" }, { status: 400 });
    }
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
