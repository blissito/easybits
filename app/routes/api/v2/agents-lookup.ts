import type { Route } from "./+types/agents-lookup";
import { findAgentByEmbedToken } from "~/.server/core/sandboxOperations";

// CORS — endpoint público; el ghosty.studio embed widget lo llama desde el
// browser del cliente para resolver embedToken → agentId. No expone otros
// detalles del agente.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// GET /api/v2/agents/lookup?embedToken=agt_...
// Returns { agentId } if the token is valid; 404 otherwise.
// Used by the embed widget so the iframe URL is just /embed/:token —
// the widget does its own first call to resolve the agentId, then chats.
export async function loader({ request }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const url = new URL(request.url);
  const token = url.searchParams.get("embedToken") ?? "";
  if (!token.startsWith("agt_")) {
    return Response.json(
      { error: "embedToken (agt_*) required" },
      { status: 400, headers: CORS_HEADERS }
    );
  }
  const agent = await findAgentByEmbedToken(token);
  if (!agent) {
    return Response.json(
      { error: "Not found" },
      { status: 404, headers: CORS_HEADERS }
    );
  }
  return Response.json(
    { agentId: agent.agentId, template: agent.template },
    { status: 200, headers: CORS_HEADERS }
  );
}
