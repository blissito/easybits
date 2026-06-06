import type { Route } from "./+types/agent-whatsapp-unlink";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { unlinkWhatsapp } from "~/.server/core/whatsappOperations";

// POST /api/v2/agents/:id/whatsapp/unlink
//
// Owner-only. Cierra la sesión Baileys en el runtime y limpia Agent.whatsapp.
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
    const result = await unlinkWhatsapp(ctx, params.id!);
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal error";
    const status = msg.includes("not found")
      ? 404
      : msg.includes("unavailable") || msg.includes("cannot reach")
        ? 400
        : 502;
    return Response.json({ error: msg }, { status });
  }
}
