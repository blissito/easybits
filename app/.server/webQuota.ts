/**
 * Cuota del toolset `web` (consultas): bucket propio, separado de los créditos
 * de generación. Una consulta = 1 página leída, 1 búsqueda, 1 registro extraído
 * o 1 página rastreada — la misma unidad que nos cobra el proveedor.
 *
 * Sólo bonus (`User.webQueriesBonus`): 50 al alta, los packs Web suman, nunca
 * caduca. No hay bucket mensual.
 */
import { db } from "./db";
import { logAiUsage } from "./aiGenerationLimit";

export async function checkWebQuota(userId: string): Promise<{ available: number }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { webQueriesBonus: true },
  });
  return { available: Math.max(0, user?.webQueriesBonus ?? 0) };
}

/**
 * Descuenta `cost` consultas (nunca por debajo de 0) y deja rastro en
 * AiGenerationLog con `source:"web"` para que el admin lo vea aparte.
 */
export async function chargeWebQueries(
  userId: string,
  log: { cost: number; type: string; durationMs?: number; resourceId?: string },
): Promise<void> {
  const cost = Math.max(0, Math.ceil(log.cost));
  if (cost === 0) return;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { webQueriesBonus: true },
  });
  const current = Math.max(0, user?.webQueriesBonus ?? 0);
  await db.user.update({
    where: { id: userId },
    data: { webQueriesBonus: Math.max(0, current - cost) },
  });
  logAiUsage(userId, {
    type: log.type,
    product: "research",
    cost,
    pageCount: cost,
    durationMs: log.durationMs,
    resourceId: log.resourceId,
    source: "web",
  });
}
