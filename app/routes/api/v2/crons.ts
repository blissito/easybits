import type { Route } from "./+types/crons";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { createUserCron, listCronAgentOptions, listUserCrons } from "~/.server/core/userCronOperations";

// GET /api/v2/crons — tus crons (`?include=agents` añade tus agentes {id,name} para `agent_turn`)
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const items = await listUserCrons(ctx);
  const withAgents = new URL(request.url).searchParams.get("include") === "agents";
  return Response.json({
    items,
    nextCursor: null,
    hasMore: false,
    total: items.length,
    ...(withAgents ? { agents: await listCronAgentOptions(ctx) } : {}),
  });
}

// POST /api/v2/crons — { name, cron | at | in, until?, times?, timezone?, enabled?, action, dryRun? }
export async function action({ request }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => ({}));
  return Response.json(await createUserCron(ctx, body), { status: body?.dryRun ? 200 : 201 });
}
