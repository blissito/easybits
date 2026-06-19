import type { AuthContext } from "../apiAuth";
import { db } from "../db";
import { sendTransactional } from "../emails/sendTransactional";
import { unsubscribeUrl } from "./contactOperations";
import { dispatchWebhooks } from "../webhooks";

/** Append a footer with an unsubscribe link (required for bulk sends). */
function withUnsubscribeFooter(html: string, contactId: string): string {
  const url = unsubscribeUrl(contactId);
  return `${html}
    <hr style="margin-top:32px;border:none;border-top:1px solid #eee" />
    <p style="font-size:12px;color:#888;text-align:center;margin-top:16px">
      <a href="${url}" style="color:#888">Cancelar suscripción</a> · Enviado con
      <a href="https://www.easybits.cloud" style="color:#888">EasyBits</a>
    </p>`;
}

export async function createBroadcast(
  ctx: AuthContext,
  opts: { subject: string; html: string; audienceTag?: string }
) {
  const record = await db.broadcast.create({
    data: {
      userId: ctx.user.id,
      subject: opts.subject,
      html: opts.html,
      audienceTag: opts.audienceTag,
      status: "draft",
    },
  });
  return { id: record.id, subject: record.subject, status: record.status };
}

/**
 * Send a broadcast to all `subscribed` contacts (optionally filtered by tag).
 * v1: sends inline in a sequential loop (fine for small lists). Skips
 * non-subscribed contacts, injects the unsubscribe footer, tracks counts, and
 * fires `broadcast.sent` when done.
 */
export async function sendBroadcast(ctx: AuthContext, broadcastId: string) {
  const broadcast = await db.broadcast.findFirst({
    where: { id: broadcastId, userId: ctx.user.id },
  });
  if (!broadcast) {
    throw new Response(JSON.stringify({ error: "Broadcast no encontrado" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  if (broadcast.status === "sent" || broadcast.status === "sending") {
    return { id: broadcast.id, status: broadcast.status, sent: broadcast.sent, failed: broadcast.failed };
  }

  const recipients = await db.contact.findMany({
    where: {
      userId: ctx.user.id,
      status: "subscribed",
      ...(broadcast.audienceTag ? { tags: { has: broadcast.audienceTag } } : {}),
    },
  });

  await db.broadcast.update({
    where: { id: broadcast.id },
    data: { status: "sending", total: recipients.length },
  });

  let sent = 0;
  let failed = 0;
  for (const contact of recipients) {
    try {
      await sendTransactional({
        to: contact.email,
        subject: broadcast.subject,
        html: withUnsubscribeFooter(broadcast.html, contact.id),
      });
      sent++;
    } catch {
      failed++;
    }
  }

  const updated = await db.broadcast.update({
    where: { id: broadcast.id },
    data: { status: "sent", sent, failed, sentAt: new Date() },
  });

  await dispatchWebhooks(ctx.user.id, "broadcast.sent", {
    id: updated.id,
    subject: updated.subject,
    total: updated.total,
    sent,
    failed,
  });

  return { id: updated.id, status: updated.status, total: updated.total, sent, failed };
}

export async function listBroadcasts(ctx: AuthContext, limit = 50) {
  const items = await db.broadcast.findMany({
    where: { userId: ctx.user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return items.map((b) => ({
    id: b.id,
    subject: b.subject,
    audienceTag: b.audienceTag,
    status: b.status,
    total: b.total,
    sent: b.sent,
    failed: b.failed,
    createdAt: b.createdAt,
    sentAt: b.sentAt,
  }));
}
