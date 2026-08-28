import type { Route } from "./+types/llm-models";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";

// GET /api/v2/llm/v1/models — lista OpenAI-compatible. Los SDKs/frameworks
// (openai, LangChain, Vercel AI) la consultan para validar `baseURL`.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type" };
const MODELS = ["deepseek-chat", "deepseek-reasoner"];

export async function loader({ request }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    requireAuth(await authenticateRequest(request));
  } catch {
    return Response.json({ error: { message: "Invalid API key", type: "invalid_api_key" } }, { status: 401, headers: CORS });
  }
  return Response.json(
    { object: "list", data: MODELS.map((id) => ({ id, object: "model", created: 0, owned_by: "deepseek" })) },
    { headers: CORS },
  );
}
