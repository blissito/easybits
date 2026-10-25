import type { Route } from "./+types/machines-adopt";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { adoptMachine } from "~/.server/core/releaseOperations";

// POST /api/v2/machines/adopt — registra una caja que ya corre y no tiene fila
// (migrada por runbook) para que sus secretos vivan en el vault. No la toca.
// Body: { sandboxId, name, tier?, unit?, importEnvFrom?, dryRun? }.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "op");
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const sandboxId = str(body?.sandboxId);
  const name = str(body?.name);
  if (!sandboxId || !name) {
    return Response.json({ error: "BadRequest", message: "Manda sandboxId y name." }, { status: 400 });
  }
  try {
    return Response.json(
      await adoptMachine(ctx, {
        sandboxId,
        name,
        tier: str(body?.tier),
        unit: str(body?.unit),
        importEnvFrom: str(body?.importEnvFrom),
        dryRun: body?.dryRun === true,
      })
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return Response.json(
      { error: e?.code ?? "AdoptFailed", message: String(e?.message ?? e) },
      { status: e?.status ?? 400 }
    );
  }
}
