import type { Route } from "./+types/agent";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { destroyAgent, getAgent, updateAgentPrompt } from "~/.server/core/sandboxOperations";

// GET /api/v2/agents/:id — owner-only agent record
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  try {
    const result = await getAgent(ctx, params.id!);
    return Response.json(result);
  } catch (e) {
    // Agente inexistente/borrado: getAgent lanza Error("agent not found").
    // Devolvemos 404 (no 500) para que los clientes (ghosty.studio) puedan
    // distinguir "no existe" de un fallo real y redirigir en lugar de tronar.
    if (e instanceof Error && /agent not found/i.test(e.message)) {
      return Response.json({ error: "agent not found" }, { status: 404 });
    }
    throw e;
  }
}

// PATCH /api/v2/agents/:id — { systemPrompt?, systemPromptMode? } cambia la identidad de
// un agente ghosty-lite ya creado (archivo en la caja + rearme de ganchos, sin reboot).
// DELETE /api/v2/agents/:id — destroys the underlying sandbox + Agent row
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "DELETE" && request.method !== "PATCH") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(
    ctx.apiKey?.id ?? ctx.user.id,
    "op"
  );
  if (limited) return limited;
  if (request.method === "PATCH") {
    const body = await request.json().catch(() => ({}));
    const mode = body?.systemPromptMode;
    if (mode !== undefined && mode !== "append" && mode !== "replace") {
      return Response.json({ error: "systemPromptMode: append | replace" }, { status: 400 });
    }
    if (typeof body?.systemPrompt !== "string" && mode === undefined) {
      return Response.json({ error: "nada que cambiar: systemPrompt y/o systemPromptMode" }, { status: 400 });
    }
    try {
      return Response.json(await updateAgentPrompt(ctx, params.id!, {
        systemPrompt: typeof body?.systemPrompt === "string" ? body.systemPrompt : undefined,
        systemPromptMode: mode,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/agent not found/i.test(msg)) return Response.json({ error: "agent not found" }, { status: 404 });
      if (/no expone el system prompt/.test(msg)) return Response.json({ error: msg }, { status: 400 });
      throw e;
    }
  }
  const result = await destroyAgent(ctx, params.id!);
  return Response.json(result);
}
