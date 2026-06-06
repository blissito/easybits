import type { Route } from "./+types/agent-resume";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { resumeAgent } from "~/.server/core/sandboxOperations";

// POST /api/v2/agents/:id/resume
//
// Owner-only. Reactiva una microVM suspendida: arranca un firecracker nuevo,
// carga el snapshot de disco y continúa la ejecución exactamente donde se
// había detenido. Mismo TAP/IP/MAC/rootfs/volumes. agentId intacto.
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
    const result = await resumeAgent(ctx, params.id!);
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal error";
    const status = msg.includes("not found")
      ? 404
      : msg.includes("cannot resume")
        ? 409
        : 502;
    return Response.json({ error: msg }, { status });
  }
}
