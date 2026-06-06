import type { Route } from "./+types/agent-suspend";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { suspendAgent } from "~/.server/core/sandboxOperations";

// POST /api/v2/agents/:id/suspend
//
// Owner-only. Snapshot la microVM a disco y mata el proceso firecracker.
// El agentId / embedToken / sandboxId no cambian — solo status pasa a
// "suspended". Reanudar con POST /api/v2/agents/:id/resume.
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
  try {
    const result = await suspendAgent(ctx, params.id!);
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal error";
    const status = msg.includes("not found")
      ? 404
      : msg.includes("cannot suspend")
        ? 409
        : 502;
    return Response.json({ error: msg }, { status });
  }
}
