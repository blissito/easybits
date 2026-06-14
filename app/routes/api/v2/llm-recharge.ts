import type { Route } from "./+types/llm-recharge";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { recargarLLMTokens, formatTokens } from "~/.server/llmTokenLimit";

/**
 * POST /api/v2/llm/recharge
 * Recarga tokens LLM para GhostyCode.
 *
 * Body: { tokens: 10_000_000 }  → 10M tokens extra
 * Los tokens se agregan al bonus (llmTokensBonus), que se consume
 * después del límite del plan. El bonus resetea en el próximo ciclo.
 */
export async function action({ request }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  const body = await request.json().catch(() => ({}));
  const tokens = body?.tokens as number;

  if (!tokens || tokens < 1_000_000 || tokens > 1_000_000_000) {
    return Response.json(
      { error: "tokens must be between 1M and 1B" },
      { status: 400 }
    );
  }

  const limit = await recargarLLMTokens(ctx.user.id, tokens);

  return Response.json({
    ok: true,
    message: `Recargados ${formatTokens(tokens)} tokens`,
    planLimit: formatTokens(limit.planLimit),
    bonus: formatTokens(limit.bonus),
    totalLimit: formatTokens(limit.limit),
    used: formatTokens(limit.used),
    remaining: formatTokens(limit.remaining),
    resetAt: limit.resetAt?.toISOString(),
  });
}
