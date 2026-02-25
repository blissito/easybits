import { handleMcp } from "~/.server/mcp/handler";
import type { Route } from "./+types/mcp";

// POST /api/mcp — JSON-RPC messages
export async function action({ request }: Route.ActionArgs) {
  return handleMcp(request);
}

// GET /api/mcp — SSE stream
export async function loader({ request }: Route.LoaderArgs) {
  return handleMcp(request);
}
