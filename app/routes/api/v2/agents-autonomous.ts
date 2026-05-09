import type { Route } from "./+types/agents-autonomous";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { spawnAutonomous } from "~/.server/core/sandboxOperations";

// POST /api/v2/agents/autonomous
// Managed-mode spawn for any autonomous-tier brand (ghosty / nanoclaw /
// openclaw). Uses host-managed Anthropic credentials; caller passes only
// the brand and optional overrides. Body: { brand, name?, systemPrompt?,
// timeoutSeconds? }.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json().catch(() => ({}));
  const brand = String(body?.brand ?? "");
  if (!["ghosty", "nanoclaw", "openclaw"].includes(brand)) {
    return Response.json(
      { error: "brand must be one of: ghosty, nanoclaw, openclaw" },
      { status: 400 }
    );
  }
  const result = await spawnAutonomous(ctx, {
    brand: brand as "ghosty" | "nanoclaw" | "openclaw",
    name: typeof body?.name === "string" ? body.name : undefined,
    systemPrompt: typeof body?.systemPrompt === "string" ? body.systemPrompt : undefined,
    timeoutSeconds: typeof body?.timeoutSeconds === "number" ? body.timeoutSeconds : undefined,
  });
  return Response.json(result);
}
