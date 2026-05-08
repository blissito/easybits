import type { Route } from "./+types/templates";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { listTemplates, type TemplateInfo } from "~/.server/core/sandboxOperations";

// GET /api/v2/templates?tier=
// Returns the sandbox template catalog (proxied from sandbox-host).
// Owner-auth only; embedTokens cannot list (no need — they're tied to a
// single agent already).
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);
  const tier = url.searchParams.get("tier") ?? undefined;
  const templates = await listTemplates(
    ctx,
    tier ? { tier: tier as TemplateInfo["tier"] } : {}
  );
  return Response.json({ templates });
}
