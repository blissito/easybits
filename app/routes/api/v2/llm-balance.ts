import type { Route } from "./+types/llm-balance";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { checkLLMTokenLimit, formatTokens } from "~/.server/llmTokenLimit";

/**
 * GET /api/v2/llm/balance
 * Devuelve el balance de tokens LLM al estilo DeepSeek /user/balance.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const limit = await checkLLMTokenLimit(ctx.user.id);

  return Response.json({
    is_available: limit.allowed,
    plan: limit.plan,
    balance_infos: [{
      currency: "tokens",
      total_balance: String(limit.limit),
      total_balance_human: formatTokens(limit.limit),
      granted_balance: String(limit.planLimit),
      granted_balance_human: formatTokens(limit.planLimit),
      topped_up_balance: String(limit.bonus),
      topped_up_balance_human: formatTokens(limit.bonus),
      used: String(limit.used),
      used_human: formatTokens(limit.used),
      remaining: String(limit.remaining),
      remaining_human: formatTokens(limit.remaining),
      reset_at: limit.resetAt?.toISOString() ?? null,
    }],
  });
}
