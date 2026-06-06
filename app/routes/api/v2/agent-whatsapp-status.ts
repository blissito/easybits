import type { Route } from "./+types/agent-whatsapp-status";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { getWhatsappStatus } from "~/.server/core/whatsappOperations";

// POST /api/v2/agents/:id/whatsapp/status
//
// Owner-only. Proxy hacia el openclaw runtime gateway en :port/whatsapp/status
// y persiste el último estado conocido en Agent.whatsapp.
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
    const result = await getWhatsappStatus(ctx, params.id!);
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal error";
    const status = msg.includes("not found")
      ? 404
      : msg.includes("unavailable") || msg.includes("cannot reach") || msg.includes("must be") || msg.includes("required")
        ? 400
        : 502;
    return Response.json({ error: msg }, { status });
  }
}
