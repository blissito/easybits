import { db } from "../db";
import { computeRealCostUsd } from "~/lib/credits";
import { engineIsMetered } from "~/lib/fleetEngines";
import type { FleetTurnUsage } from "./fleetAgentOperations";

/**
 * Registro contable de un turno de flota.
 *
 * El dato ya se medía —el worker lo emite y `routeMessage` lo compone— pero sólo lo
 * consumía el SSE del navegador y se descartaba; el canal de más volumen (WhatsApp/WABA)
 * ni siquiera pasaba el callback. Resultado: cero visibilidad de quién consume qué, y
 * ninguna base sobre la que vender flota gestionada.
 *
 * Dos efectos, deliberadamente separados (misma división que `llmProxyBilling.bill`):
 *
 *   - REGISTRAR (siempre): una fila de atribución con agente, conversación, tokens y
 *     costo real. Responde "cuánto me gasta cada cliente", que es lo que pregunta un
 *     integrador que revende el agente, y permite detectar abuso.
 *
 *   - DESCONTAR CUOTA (sólo si el motor es medido o el agente es `managed`): el resto
 *     son BYOK — la llave es del dueño y ya paga su proveedor; descontarle cuota además
 *     sería cobrarle dos veces.
 *
 * ⚠️ Doble cobro: el motor `easybits` corre sobre `ghosty-gc`, que llama al proxy
 * `/api/v2/llm/...`, y ESE ya hace `incrementLLMTokens`. Por eso el descuento vive tras
 * `FLEET_METER_QUOTA=on`: hasta confirmar contra producción que un turno medido no pasa
 * por ambos caminos, sólo se registra. Registrar de más no le cuesta nada a nadie;
 * cobrar de más, sí.
 */

export type FleetUsageContext = {
  ownerId: string;
  fleetAgentId: string;
  groupId: string;
  /** Motor resuelto del agente (FLEET_ENGINES). */
  engine?: { id: string; billing?: "byok" | "metered" } | null;
  /** `FleetAgent.billingMode` — "managed" fuerza el cobro aunque el motor sea BYOK. */
  billingMode?: string | null;
};

export function shouldChargeQuota(ctx: FleetUsageContext): boolean {
  return ctx.billingMode === "managed" || engineIsMetered(ctx.engine);
}

export function recordFleetTurnUsage(ctx: FleetUsageContext, usage: FleetTurnUsage): void {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const cachedInputTokens = usage.cacheReadInputTokens ?? 0;

  // Un turno sin tokens (worker viejo que no emite `usage`) igual deja rastro: la
  // duración y el número de tools sirven para detectar abuso aunque falte el contaje.
  db.aiGenerationLog
    .create({
      data: {
        userId: ctx.ownerId,
        type: "fleet.turn",
        product: "compute",
        // 1, no el COST_DOC por defecto: estas filas no consumen créditos y un 100
        // cosmético ensucia cualquier reporte que sume `cost` sin filtrar por type.
        cost: 1,
        modelId: usage.model ?? ctx.engine?.id ?? null,
        inputTokens: inputTokens || null,
        outputTokens: outputTokens || null,
        cachedInputTokens: cachedInputTokens || null,
        cacheCreationInputTokens: usage.cacheCreationInputTokens ?? null,
        durationMs: usage.durationMs ?? null,
        fleetAgentId: ctx.fleetAgentId,
        groupId: ctx.groupId,
        realCostUsd:
          inputTokens || outputTokens
            ? computeRealCostUsd(inputTokens, outputTokens, cachedInputTokens)
            : null,
      },
    })
    .catch(() => {}); // fire-and-forget: contabilizar nunca debe tumbar un turno

  if (!shouldChargeQuota(ctx)) return;
  if ((process.env.FLEET_METER_QUOTA || "").toLowerCase() !== "on") return;

  const total = inputTokens + outputTokens;
  if (total <= 0) return;
  void import("../llmTokenLimit").then(({ incrementLLMTokens }) =>
    incrementLLMTokens(ctx.ownerId, total)
  );
}
