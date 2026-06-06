import type { Route } from "./+types/agent-skills-import";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { copySkill } from "~/.server/core/skillsOperations";

// POST /api/v2/agents/:id/skills/import
//
// Owner-only. Copia una skill de OTRO agente (fromAgentId) a este (:id),
// reusando readFile del origen + installSkill en el destino. JSON body:
//   { fromAgentId: string, name: string }
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(
    ctx.apiKey?.id ?? ctx.user.id,
    "op"
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as {
    fromAgentId?: unknown;
    name?: unknown;
  };
  const fromAgentId = typeof body.fromAgentId === "string" ? body.fromAgentId : "";
  const name = typeof body.name === "string" ? body.name : "";
  if (!fromAgentId || !name) {
    return Response.json(
      { error: "fromAgentId and name required" },
      { status: 400 }
    );
  }

  try {
    const result = await copySkill(ctx, params.id!, { fromAgentId, name });
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal error";
    const status = msg.includes("not found")
      ? 404
      : msg.includes("unavailable") ||
          msg.includes("must") ||
          msg.includes("invalid") ||
          msg.includes("required") ||
          msg.includes("exceeds") ||
          msg.includes("empty") ||
          msg.includes("duplicate") ||
          msg.includes("cannot") ||
          msg.includes("does not expose")
        ? 400
        : 502;
    return Response.json({ error: msg }, { status });
  }
}
