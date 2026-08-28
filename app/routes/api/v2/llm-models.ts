import type { Route } from "./+types/llm-models";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getSecretValue } from "~/.server/core/secretOperations";

// GET /api/v2/llm/v1/models — proxy transparente a DeepSeek /models (caché 5 min).
// NO hardcodear modelos: DeepSeek publica nuevos (v4-flash, v4-pro, …) sin aviso.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type" };
const TTL_MS = 5 * 60_000;
let cache: { at: number; body: unknown } | null = null;

export async function loader({ request }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  let userId: string;
  try {
    userId = requireAuth(await authenticateRequest(request)).user.id;
  } catch {
    return Response.json({ error: { message: "Invalid API key", type: "invalid_api_key" } }, { status: 401, headers: CORS });
  }
  if (cache && Date.now() - cache.at < TTL_MS) return Response.json(cache.body, { headers: CORS });

  const key = process.env.DEEPSEEK_API_KEY || (await getSecretValue(userId, "DEEPSEEK_API_KEY").catch(() => null));
  if (!key) return Response.json({ error: { message: "DeepSeek key not configured", type: "invalid_api_key" } }, { status: 402, headers: CORS });

  const up = await fetch("https://api.deepseek.com/v1/models", { headers: { Authorization: `Bearer ${key}` } }).catch(() => null);
  if (!up?.ok) {
    if (cache) return Response.json(cache.body, { headers: CORS }); // stale-while-error
    return Response.json({ error: { message: "Upstream error", type: "proxy_error" } }, { status: 502, headers: CORS });
  }
  const body = await up.json();
  cache = { at: Date.now(), body };
  return Response.json(body, { headers: CORS });
}
