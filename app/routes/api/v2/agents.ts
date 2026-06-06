import type { Route } from "./+types/agents";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import {
  createAgent,
  listAgents,
  type SandboxTemplate,
} from "~/.server/core/sandboxOperations";

// GET /api/v2/agents — list agents owned by the caller
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const agents = await listAgents(ctx);
  return Response.json({ agents });
}

// POST /api/v2/agents — generic create with full template + env control
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(
    ctx.apiKey?.id ?? ctx.user.id,
    "create"
  );
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  if (!body?.template || typeof body.env !== "object" || body.env === null) {
    return Response.json({ error: "template and env required" }, { status: 400 });
  }
  const result = await createAgent(ctx, {
    template: body.template as SandboxTemplate,
    env: body.env as Record<string, string>,
    name: typeof body.name === "string" ? body.name : undefined,
    timeoutSeconds: typeof body.timeoutSeconds === "number" ? body.timeoutSeconds : undefined,
    seedFiles: Array.isArray(body.seedFiles) ? body.seedFiles : undefined,
    // port/healthPath ya no se aceptan del caller — vienen del template
    // metadata leído por createAgent.
  });
  return Response.json(result);
}
