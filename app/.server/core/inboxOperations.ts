// Buzones de eventos: un webhook de verdad de EasyBits. Cada buzón tiene una URL pública
// (/hooks/<token>) donde cualquiera escribe (un cron, Stripe, GitHub, Formmy). Lo que llega va en
// vivo a quien esté escuchando (`easybits inbox listen`, SSE) y, si nadie escucha, se queda
// guardado: `inbox read` regresa lo no leído y mueve el cursor. Fuente ÚNICA de REST, MCP, CLI,
// SDK, panel y del aviso de crons (`notify.inbox`).
//
// El stream revisa la BASE (no memoria del proceso): con el despliegue azul/verde el que escribe y
// el que escucha pueden caer en colores distintos.
import { randomBytes } from "node:crypto";
import type { EventInbox, InboxEvent } from "@prisma/client";
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { getUserPlan, type PlanKey } from "~/lib/plans";

export const INBOX_LIMITS: Record<PlanKey, number> = { Byte: 3, Mega: 20, Tera: 100 };
/** Tope del cuerpo de un evento. */
export const INBOX_BODY_MAX = 256 * 1024;
/** Eventos que se guardan por buzón (se poda lo más viejo al escribir). */
export const INBOX_KEEP_MAX = 1000;
const RETENTION_MAX_DAYS = 30;
const READ_MAX = 200;
/** Headers que nunca se guardan: credenciales del que llama. */
const DROP_HEADERS = /^(authorization|cookie|set-cookie|proxy-authorization|x-api-key|x-auth-token|x-forwarded-.*|x-real-ip|cf-.*|x-easybits-.*)$/i;

const bad = (error: string, status = 400) => Response.json({ error }, { status });

const appBase = () => (process.env.BASE_URL || "https://www.easybits.cloud").replace(/\/$/, "");
/** URL pública del buzón. */
export const inboxUrl = (token: string) => `${appBase()}/hooks/${token}`;
const newToken = () => `ib_${randomBytes(24).toString("base64url")}`;

export type InboxView = {
  id: string;
  name: string;
  /** Donde se escribe: POST con cualquier cuerpo. Quien la tenga puede escribir. */
  url: string;
  retentionDays: number;
  /** Eventos sin leer (`seq > readSeq`). */
  unread: number;
  lastSeq: number;
  lastEventAt: string | null;
  createdAt: string;
};

export const toInboxView = (b: EventInbox): InboxView => ({
  id: b.id,
  name: b.name,
  url: inboxUrl(b.token),
  retentionDays: b.retentionDays,
  unread: Math.max(b.nextSeq - b.readSeq, 0),
  lastSeq: b.nextSeq,
  lastEventAt: b.lastEventAt?.toISOString() ?? null,
  createdAt: b.createdAt.toISOString(),
});

export type InboxEventView = {
  seq: number;
  source: string;
  method: string | null;
  contentType: string | null;
  headers: Record<string, string>;
  /** El cuerpo tal cual llegó (texto). */
  body: string;
  /** Si el cuerpo es JSON, ya parseado. */
  json?: unknown;
  receivedAt: string;
};

export function toEventView(e: InboxEvent): InboxEventView {
  const out: InboxEventView = {
    seq: e.seq,
    source: e.source,
    method: e.method ?? null,
    contentType: e.contentType ?? null,
    headers: (e.headers as Record<string, string> | null) ?? {},
    body: e.body,
    receivedAt: e.receivedAt.toISOString(),
  };
  if (/json/i.test(e.contentType ?? "") || /^\s*[[{]/.test(e.body)) {
    try {
      out.json = JSON.parse(e.body);
    } catch {
      /* no era JSON */
    }
  }
  return out;
}

/** Los headers que se guardan: sin credenciales, en minúsculas, cortos. Pura, con test. */
export function keepHeaders(h: Headers | Record<string, string>): Record<string, string> {
  const entries = h instanceof Headers ? [...h.entries()] : Object.entries(h);
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    const key = k.toLowerCase();
    if (DROP_HEADERS.test(key) || Object.keys(out).length >= 40) continue;
    out[key] = String(v).slice(0, 1000);
  }
  return out;
}

async function findOwned(ctx: AuthContext, ref: string): Promise<EventInbox> {
  const row = /^[a-f0-9]{24}$/.test(ref)
    ? await db.eventInbox.findFirst({ where: { id: ref, ownerId: ctx.user.id } })
    : await db.eventInbox.findFirst({ where: { name: ref, ownerId: ctx.user.id } });
  if (!row) throw bad("Buzón no encontrado", 404);
  return row;
}

function cleanName(raw: unknown): string {
  const name = String(raw ?? "").trim().slice(0, 60);
  if (!name) throw bad("name es obligatorio");
  if (/^[a-f0-9]{24}$/.test(name)) throw bad("name no puede parecer un id");
  return name;
}

function cleanRetention(raw: unknown): number {
  if (raw == null) return 7;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > RETENTION_MAX_DAYS) throw bad(`retentionDays entre 1 y ${RETENTION_MAX_DAYS}`);
  return n;
}

export async function listInboxes(ctx: AuthContext): Promise<InboxView[]> {
  requireScope(ctx, "READ");
  const rows = await db.eventInbox.findMany({ where: { ownerId: ctx.user.id }, orderBy: { createdAt: "asc" } });
  return rows.map(toInboxView);
}

export async function getInbox(ctx: AuthContext, ref: string): Promise<InboxView> {
  requireScope(ctx, "READ");
  return toInboxView(await findOwned(ctx, ref));
}

export async function createInbox(ctx: AuthContext, input: { name?: unknown; retentionDays?: unknown }): Promise<InboxView> {
  requireScope(ctx, "WRITE");
  const name = cleanName(input.name);
  const retentionDays = cleanRetention(input.retentionDays);
  const plan = getUserPlan(ctx.user);
  const limit = INBOX_LIMITS[plan];
  const [count, dup] = await Promise.all([
    db.eventInbox.count({ where: { ownerId: ctx.user.id } }),
    db.eventInbox.findFirst({ where: { ownerId: ctx.user.id, name }, select: { id: true } }),
  ]);
  if (dup) throw bad(`Ya tienes un buzón «${name}»`, 409);
  if (count >= limit) throw bad(`Tu plan ${plan} permite ${limit} buzones; borra uno o sube de plan.`, 403);
  const row = await db.eventInbox.create({ data: { ownerId: ctx.user.id, name, retentionDays, token: newToken() } });
  return toInboxView(row);
}

export async function updateInbox(ctx: AuthContext, ref: string, input: { name?: unknown; retentionDays?: unknown }): Promise<InboxView> {
  requireScope(ctx, "WRITE");
  const b = await findOwned(ctx, ref);
  const data: { name?: string; retentionDays?: number } = {};
  if (input.name !== undefined) data.name = cleanName(input.name);
  if (input.retentionDays !== undefined) data.retentionDays = cleanRetention(input.retentionDays);
  return toInboxView(await db.eventInbox.update({ where: { id: b.id }, data }));
}

/** URL nueva: la vieja deja de aceptar eventos de inmediato. */
export async function rotateInboxToken(ctx: AuthContext, ref: string): Promise<InboxView> {
  requireScope(ctx, "WRITE");
  const b = await findOwned(ctx, ref);
  return toInboxView(await db.eventInbox.update({ where: { id: b.id }, data: { token: newToken() } }));
}

export async function deleteInbox(ctx: AuthContext, ref: string): Promise<{ deleted: true; id: string }> {
  requireScope(ctx, "DELETE");
  const b = await findOwned(ctx, ref);
  await db.inboxEvent.deleteMany({ where: { inboxId: b.id } });
  await db.eventInbox.delete({ where: { id: b.id } });
  return { deleted: true, id: b.id };
}

export type AppendInput = {
  source: "http" | "cron";
  method?: string | null;
  contentType?: string | null;
  headers?: Record<string, string>;
  body: string;
};

/**
 * Agrega un evento. El `seq` sale de un update atómico (increment) sobre el buzón, así dos
 * escrituras simultáneas nunca comparten número. Poda al escribir: lo más viejo que la retención
 * y lo que pase de INBOX_KEEP_MAX.
 */
export async function appendInboxEvent(inbox: Pick<EventInbox, "id" | "ownerId" | "retentionDays">, e: AppendInput): Promise<{ seq: number }> {
  if (Buffer.byteLength(e.body) > INBOX_BODY_MAX) throw bad("El cuerpo pasa de 256 KB", 413);
  const now = new Date();
  const b = await db.eventInbox.update({ where: { id: inbox.id }, data: { nextSeq: { increment: 1 }, lastEventAt: now } });
  await db.inboxEvent.create({
    data: {
      inboxId: inbox.id,
      ownerId: inbox.ownerId,
      seq: b.nextSeq,
      source: e.source,
      method: e.method ?? null,
      contentType: e.contentType ?? null,
      headers: e.headers ?? {},
      body: e.body,
      receivedAt: now,
    },
  });
  // Poda (best-effort: nunca rompe la escritura).
  void db.inboxEvent
    .deleteMany({
      where: {
        inboxId: inbox.id,
        OR: [{ receivedAt: { lt: new Date(now.getTime() - inbox.retentionDays * 86_400_000) } }, { seq: { lte: b.nextSeq - INBOX_KEEP_MAX } }],
      },
    })
    .catch(() => undefined);
  return { seq: b.nextSeq };
}

/** Receptor público: busca el buzón por su token. null si no existe. */
export const inboxByToken = (token: string) =>
  /^ib_[A-Za-z0-9_-]{20,64}$/.test(token) ? db.eventInbox.findUnique({ where: { token } }) : Promise.resolve(null);

export type InboxRead = {
  items: InboxEventView[];
  /** El último seq entregado: pásalo como `since` para seguir desde ahí. */
  cursor: number;
  /** Los que siguen sin leer después de esta lectura. */
  unread: number;
};

/**
 * Lee eventos. Sin `since`: lo NO leído (`seq > readSeq`). Con `ack` (default true) el cursor del
 * buzón avanza hasta lo entregado, así la siguiente lectura sólo trae lo nuevo.
 */
export async function readInboxEvents(
  ctx: AuthContext,
  ref: string,
  opts: { since?: number; limit?: number; ack?: boolean } = {}
): Promise<InboxRead> {
  requireScope(ctx, "READ");
  const b = await findOwned(ctx, ref);
  const since = opts.since ?? b.readSeq;
  const take = Math.min(Math.max(opts.limit ?? 50, 1), READ_MAX);
  const rows = await db.inboxEvent.findMany({ where: { inboxId: b.id, seq: { gt: since } }, orderBy: { seq: "asc" }, take });
  const cursor = rows.length ? rows[rows.length - 1].seq : since;
  const ack = opts.ack !== false;
  if (ack && cursor > b.readSeq) {
    // Sólo hacia adelante: dos lecturas a la vez no regresan el cursor.
    await db.eventInbox.updateMany({ where: { id: b.id, readSeq: { lt: cursor } }, data: { readSeq: cursor } });
  }
  const readTo = ack ? Math.max(cursor, b.readSeq) : b.readSeq;
  return { items: rows.map(toEventView), cursor, unread: Math.max(b.nextSeq - readTo, 0) };
}

/**
 * Stream para `listen`: primero lo pendiente desde `since` (default: lo no leído), luego cada 1 s
 * lo nuevo. No mueve el cursor de lectura (escuchar no es leer): eso lo hace `read`.
 */
export async function openInboxStream(ctx: AuthContext, ref: string, opts: { since?: number; signal?: AbortSignal } = {}) {
  requireScope(ctx, "READ");
  const b = await findOwned(ctx, ref);
  let last = opts.since ?? b.readSeq;
  const enc = new TextEncoder();
  let poll: ReturnType<typeof setInterval> | undefined;
  let beat: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    clearInterval(poll);
    clearInterval(beat);
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let busy = false;
      const send = (chunk: string) => {
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          stop();
        }
      };
      const tick = async () => {
        if (busy) return;
        busy = true;
        try {
          const rows = await db.inboxEvent.findMany({ where: { inboxId: b.id, seq: { gt: last } }, orderBy: { seq: "asc" }, take: 100 });
          for (const r of rows) {
            send(`id: ${r.seq}\nevent: inbox\ndata: ${JSON.stringify(toEventView(r))}\n\n`);
            last = r.seq;
          }
        } catch {
          /* tropiezo de la base: el siguiente tick reintenta */
        } finally {
          busy = false;
        }
      };
      send(`event: ready\ndata: ${JSON.stringify({ inbox: b.id, name: b.name, since: last })}\n\n`);
      void tick();
      poll = setInterval(tick, 1000);
      beat = setInterval(() => send(": latido\n\n"), 15_000);
      opts.signal?.addEventListener("abort", () => {
        stop();
        try {
          controller.close();
        } catch {
          /* ya cerrado */
        }
      });
    },
    cancel: stop,
  });
}

/** Para `notify.inbox` de los crons: el buzón del dueño por id. */
export const ownedInbox = (ownerId: string, id: string) =>
  /^[a-f0-9]{24}$/.test(id) ? db.eventInbox.findFirst({ where: { id, ownerId } }) : Promise.resolve(null);
