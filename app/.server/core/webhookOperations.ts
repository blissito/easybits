import { randomBytes } from "crypto";
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import type { WebhookEvent } from "../webhooks";

const VALID_EVENTS: WebhookEvent[] = [
  "file.created",
  "file.updated",
  "file.deleted",
  "file.restored",
  "website.created",
  "website.deleted",
];

export async function listWebhooks(ctx: AuthContext) {
  requireScope(ctx, "READ");
  const webhooks = await db.webhook.findMany({
    where: { userId: ctx.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      url: true,
      events: true,
      status: true,
      failCount: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return { items: webhooks };
}

export async function createWebhook(
  ctx: AuthContext,
  opts: { url: string; events: string[] }
) {
  requireScope(ctx, "WRITE");

  const url = opts.url.trim();
  if (!url.startsWith("https://")) {
    throw new Response(JSON.stringify({ error: "Webhook URL must use HTTPS" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const events = opts.events.filter((e) => VALID_EVENTS.includes(e as WebhookEvent));
  if (events.length === 0) {
    throw new Response(
      JSON.stringify({ error: `No valid events. Valid: ${VALID_EVENTS.join(", ")}` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const count = await db.webhook.count({ where: { userId: ctx.user.id } });
  if (count >= 10) {
    throw new Response(JSON.stringify({ error: "Max 10 webhooks per account" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const secret = `whsec_${randomBytes(24).toString("hex")}`;

  const webhook = await db.webhook.create({
    data: {
      url,
      events,
      secret,
      userId: ctx.user.id,
    },
  });

  return {
    id: webhook.id,
    url: webhook.url,
    events: webhook.events,
    secret: webhook.secret, // only shown on creation
    status: webhook.status,
    createdAt: webhook.createdAt,
  };
}

export async function getWebhook(ctx: AuthContext, webhookId: string) {
  requireScope(ctx, "READ");
  const webhook = await db.webhook.findUnique({ where: { id: webhookId } });
  if (!webhook || webhook.userId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Webhook not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return {
    id: webhook.id,
    url: webhook.url,
    events: webhook.events,
    status: webhook.status,
    failCount: webhook.failCount,
    lastError: webhook.lastError,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
  };
}

export async function updateWebhookConfig(
  ctx: AuthContext,
  webhookId: string,
  opts: { url?: string; events?: string[]; status?: string }
) {
  requireScope(ctx, "WRITE");
  const webhook = await db.webhook.findUnique({ where: { id: webhookId } });
  if (!webhook || webhook.userId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Webhook not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const updates: Record<string, unknown> = {};

  if (opts.url !== undefined) {
    if (!opts.url.startsWith("https://")) {
      throw new Response(JSON.stringify({ error: "Webhook URL must use HTTPS" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    updates.url = opts.url;
  }

  if (opts.events !== undefined) {
    const events = opts.events.filter((e) => VALID_EVENTS.includes(e as WebhookEvent));
    if (events.length === 0) {
      throw new Response(
        JSON.stringify({ error: `No valid events. Valid: ${VALID_EVENTS.join(", ")}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    updates.events = events;
  }

  if (opts.status === "ACTIVE" || opts.status === "PAUSED") {
    updates.status = opts.status;
    if (opts.status === "ACTIVE") {
      updates.failCount = 0;
      updates.lastError = null;
    }
  }

  const updated = await db.webhook.update({
    where: { id: webhookId },
    data: updates,
  });

  return {
    id: updated.id,
    url: updated.url,
    events: updated.events,
    status: updated.status,
    failCount: updated.failCount,
    lastError: updated.lastError,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

export async function deleteWebhookById(ctx: AuthContext, webhookId: string) {
  requireScope(ctx, "DELETE");
  const webhook = await db.webhook.findUnique({ where: { id: webhookId } });
  if (!webhook || webhook.userId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Webhook not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  await db.webhook.delete({ where: { id: webhookId } });
  return { success: true };
}
