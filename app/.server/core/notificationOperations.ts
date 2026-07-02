import { db } from "../db";
import type { Prisma } from "@prisma/client";

// In-app notification center (per-user). Simple + solid: a Notification row is
// created server-side (e.g. from the purge cron), the dashboard shows an unread
// badge, and the user reads/marks them from a popover. No SSE in v1 — the user
// sees new notifications on the next dashboard load (see api/sse/files.ts if we
// later want live push).

export type NotificationType = "file.purged"; // extend as more events notify

export async function createNotification(
  userId: string,
  input: { type: NotificationType; title: string; body?: string; metadata?: Prisma.InputJsonValue }
) {
  return db.notification.create({
    data: {
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      metadata: input.metadata,
    },
  });
}

// One grouped notification per purge run per owner (anti-spam). `fileNames` is
// the list of names permanently deleted in this run.
export async function notifyFilesPurged(ownerId: string, fileNames: string[]) {
  const count = fileNames.length;
  if (count < 1) return null;
  const title = `Se ${count === 1 ? "borró" : "borraron"} permanentemente ${count} archivo${count === 1 ? "" : "s"} de tu papelera`;
  return createNotification(ownerId, {
    type: "file.purged",
    title,
    body: fileNames.slice(0, 5).join(", ") + (count > 5 ? `, +${count - 5} más` : ""),
    metadata: { count, fileNames },
  });
}

export async function listNotifications(userId: string, { limit = 20 }: { limit?: number } = {}) {
  return db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function countUnread(userId: string) {
  return db.notification.count({ where: { userId, read: false } });
}

// Mark notifications read. Always scoped by userId so a caller can't touch
// another user's rows (no IDOR). `all` marks every unread one; otherwise only
// the given ids (still filtered by userId).
export async function markNotificationsRead(
  userId: string,
  { ids, all }: { ids?: string[]; all?: boolean }
) {
  const where: Prisma.NotificationWhereInput = all
    ? { userId, read: false }
    : { userId, id: { in: ids ?? [] } };
  const res = await db.notification.updateMany({ where, data: { read: true } });
  return res.count;
}
