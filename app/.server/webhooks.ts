import { createHmac } from "crypto";
import { db } from "./db";

/**
 * Catálogo ÚNICO de eventos. Todo lo demás —el validador del REST, los `z.enum` del
 * MCP y la lista de los docs— se DERIVA de aquí.
 *
 * ⚠️ Antes eran cuatro listas escritas a mano y ya habían divergido: `workspace.created`
 * y `workspace.deleted` se despachaban desde el código pero NO se podían suscribir (ni por
 * REST ni por MCP), y los docs además se saltaban `broadcast.sent`. Un evento que se emite
 * y nadie puede escuchar no falla: simplemente no pasa nada, que es el peor modo de fallo.
 * `test/webhookCatalog.test.ts` falla si alguna superficie se vuelve a desincronizar.
 */
export const WEBHOOK_EVENTS = [
  "file.created",
  "file.updated",
  "file.deleted",
  "file.restored",
  "website.created",
  "website.deleted",
  "workspace.created",
  "workspace.deleted",
  "database.created",
  "database.deleted",
  "form.submitted",
  "payment.paid",
  "broadcast.sent",
  "turn.completed",
  "turn.failed",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/**
 * One line per event. Feeds the public docs (`docs/reference.ts`), so it is written in
 * English like the rest of that surface — and written ONCE.
 */
export const WEBHOOK_EVENT_DOCS: Record<WebhookEvent, string> = {
  "file.created": "new file uploaded",
  "file.updated": "file name, access, or metadata changed",
  "file.deleted": "file soft-deleted",
  "file.restored": "file restored from trash",
  "website.created": "new website created",
  "website.deleted": "website deleted",
  "workspace.created": "new workspace created",
  "workspace.deleted": "workspace deleted",
  "database.created": "new database created",
  "database.deleted": "database deleted",
  "form.submitted": "a form was submitted",
  "payment.paid": "a payment link was paid",
  "broadcast.sent": "a broadcast was sent",
  "turn.completed":
    "a fleet agent finished a turn — carries `title`/`summary` ready for a visible push " +
    "notification and a `cursor` to fetch the delta in one call",
  "turn.failed":
    "a turn ended with no reply (no capacity, rate limited, or worker error) — without " +
    'this a mobile client cannot tell "still thinking" from "died"',
};

const MAX_FAIL_COUNT = 5;
const TIMEOUT_MS = 10_000;

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

function sign(payload: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

/**
 * Caché NEGATIVA: usuarios que no tienen ningún webhook activo.
 *
 * `turn.completed` pone webhooks en el camino más caliente del producto — un turno de
 * agente es muchísimo más frecuente que `file.created`, y la inmensa mayoría de las
 * cuentas no tiene webhooks. Sin esto, cada turno de cada agente paga un `findMany`
 * contra Mongo para descubrir que no hay nada que mandar.
 *
 * Solo cachea el NO (barato y seguro de equivocarse por poco tiempo); el sí siempre
 * consulta. `forgetWebhookCache()` la invalida al crear o modificar uno, así que el TTL es
 * una red por si algo escribe la tabla por otro camino.
 */
const SIN_WEBHOOKS_TTL_MS = 60_000;
const sinWebhooks = new Map<string, number>();

/** Invalida la caché negativa de un usuario. La llaman create/update/delete. */
export function forgetWebhookCache(userId: string) {
  sinWebhooks.delete(userId);
}

/**
 * Dispatch webhook event to all active webhooks for a user.
 * Fire-and-forget — errors are caught and logged, never thrown.
 */
export async function dispatchWebhooks(
  userId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
) {
  const vencimiento = sinWebhooks.get(userId);
  if (vencimiento !== undefined) {
    if (vencimiento > Date.now()) return;
    sinWebhooks.delete(userId);
  }

  let webhooks;
  try {
    webhooks = await db.webhook.findMany({
      where: {
        userId,
        status: "ACTIVE",
        events: { has: event },
      },
    });
    // Ojo: la consulta filtra por `event`, así que "cero resultados" no basta para
    // concluir que el usuario no tiene webhooks — podría tener uno suscrito a OTRO
    // evento. Se confirma con un conteo sin filtro de evento, y solo entonces se cachea.
    if (webhooks.length === 0) {
      const activos = await db.webhook.count({ where: { userId, status: "ACTIVE" } });
      if (activos === 0) sinWebhooks.set(userId, Date.now() + SIN_WEBHOOKS_TTL_MS);
    }
  } catch {
    return;
  }

  if (webhooks.length === 0) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };
  const body = JSON.stringify(payload);

  const deliveries = webhooks.map(async (webhook) => {
    const signature = sign(body, webhook.secret);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Easybits-Signature": signature,
          "X-Easybits-Event": event,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      // Success — reset fail count if it was non-zero
      if (webhook.failCount > 0) {
        await db.webhook.update({
          where: { id: webhook.id },
          data: { failCount: 0, lastError: null },
        });
      }
    } catch (err) {
      const newFailCount = webhook.failCount + 1;
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      await db.webhook.update({
        where: { id: webhook.id },
        data: {
          failCount: newFailCount,
          lastError: errorMsg,
          ...(newFailCount >= MAX_FAIL_COUNT ? { status: "FAILED" } : {}),
        },
      }).catch(() => {});
    }
  });

  // Fire-and-forget: don't await in the request path
  Promise.allSettled(deliveries).catch(() => {});
}
