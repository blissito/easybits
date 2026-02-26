import { createHmac } from "crypto";
import { db } from "./db";

export type WebhookEvent =
  | "file.created"
  | "file.updated"
  | "file.deleted"
  | "file.restored"
  | "website.created"
  | "website.deleted";

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
 * Dispatch webhook event to all active webhooks for a user.
 * Fire-and-forget — errors are caught and logged, never thrown.
 */
export async function dispatchWebhooks(
  userId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
) {
  let webhooks;
  try {
    webhooks = await db.webhook.findMany({
      where: {
        userId,
        status: "ACTIVE",
        events: { has: event },
      },
    });
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
