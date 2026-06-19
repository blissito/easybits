import { createHmac, timingSafeEqual } from "crypto";
import type { AuthContext } from "../apiAuth";
import { db } from "../db";
import { config } from "../config";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function unsubSecret(): string {
  return process.env.SECRET || "easybitscloud_not_secure";
}

/** Signed, non-enumerable unsubscribe token: <contactId>.<hmac>. */
export function unsubscribeToken(contactId: string): string {
  const sig = createHmac("sha256", unsubSecret()).update(contactId).digest("hex");
  return `${contactId}.${sig}`;
}

export function unsubscribeUrl(contactId: string): string {
  return `${config.baseUrl}/u/unsubscribe?t=${unsubscribeToken(contactId)}`;
}

function verifyUnsubToken(token: string): string | null {
  const [contactId, sig] = token.split(".");
  if (!contactId || !sig) return null;
  const expected = createHmac("sha256", unsubSecret()).update(contactId).digest("hex");
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return contactId;
}

export async function addContact(
  ctx: AuthContext,
  opts: { email: string; name?: string; tags?: string[] }
) {
  const email = opts.email.trim().toLowerCase();
  if (!emailRe.test(email)) {
    throw new Response(JSON.stringify({ error: "Email inválido" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const record = await db.contact.upsert({
    where: { userId_email: { userId: ctx.user.id, email } },
    create: {
      userId: ctx.user.id,
      email,
      name: opts.name,
      tags: opts.tags ?? [],
    },
    update: {
      ...(opts.name ? { name: opts.name } : {}),
      ...(opts.tags ? { tags: opts.tags } : {}),
    },
  });
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    tags: record.tags,
    status: record.status,
  };
}

export async function listContacts(
  ctx: AuthContext,
  opts?: { tag?: string; limit?: number }
) {
  const contacts = await db.contact.findMany({
    where: {
      userId: ctx.user.id,
      ...(opts?.tag ? { tags: { has: opts.tag } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts?.limit ?? 100,
  });
  return contacts.map((c) => ({
    id: c.id,
    email: c.email,
    name: c.name,
    tags: c.tags,
    status: c.status,
    createdAt: c.createdAt,
  }));
}

/** Flip a contact to unsubscribed from a signed token. Returns the email or null. */
export async function unsubscribeContact(token: string): Promise<string | null> {
  const contactId = verifyUnsubToken(token);
  if (!contactId) return null;
  const contact = await db.contact
    .update({
      where: { id: contactId },
      data: { status: "unsubscribed" },
    })
    .catch(() => null);
  return contact?.email ?? null;
}
