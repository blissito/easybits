import { and, asc, eq, lte, or, sql } from 'drizzle-orm';
import { monotonicFactory } from 'ulid';
import { type Drizzle, Schema } from './drizzle/index.js';
import { isUniqueViolation } from './util.js';

const generateUlid = monotonicFactory();

export type QueueRow = typeof Schema.queue.$inferSelect;

export interface EnqueueInput {
  queueName: string;
  payload: Buffer;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  delayMs?: number;
  messageId?: string;
}

/**
 * Cola persistente en la tabla `workflow_queue`, con reclamo atómico y lease.
 *
 * - `claim` toma el mensaje listo más antiguo (pending y vencido su not_before,
 *   o processing con lease caducado) en un solo UPDATE ... RETURNING, así dos
 *   workers nunca se llevan el mismo.
 * - `heartbeat` extiende el lease mientras la entrega sigue viva.
 * - `ack` borra la fila; `reschedule` la devuelve a pending para más tarde.
 */
export function createQueueStore(drizzle: Drizzle) {
  const { queue } = Schema;

  return {
    async enqueue(input: EnqueueInput): Promise<{ messageId: string; deduplicated: boolean }> {
      const messageId = input.messageId ?? `msg_${generateUlid()}`;
      const notBefore = new Date(Date.now() + Math.max(0, input.delayMs ?? 0));
      try {
        await drizzle.insert(queue).values({
          messageId,
          queueName: input.queueName,
          payload: input.payload,
          headers: input.headers ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          status: 'pending',
          attempt: 0,
          notBefore,
        });
        return { messageId, deduplicated: false };
      } catch (err) {
        if (input.idempotencyKey && isUniqueViolation(err, 'workflow_queue.idempotency_key')) {
          const [existing] = await drizzle
            .select({ messageId: queue.messageId })
            .from(queue)
            .where(eq(queue.idempotencyKey, input.idempotencyKey))
            .limit(1);
          if (existing) return { messageId: existing.messageId, deduplicated: true };
        }
        throw err;
      }
    },

    async claim(workerId: string, leaseMs: number, now = new Date()): Promise<QueueRow | undefined> {
      const lockedUntil = new Date(now.getTime() + leaseMs);
      const ready = or(
        and(eq(queue.status, 'pending'), lte(queue.notBefore, now)),
        and(eq(queue.status, 'processing'), lte(queue.lockedUntil, now))
      );
      const candidate = drizzle
        .select({ messageId: queue.messageId })
        .from(queue)
        .where(ready)
        .orderBy(asc(queue.notBefore), asc(queue.messageId))
        .limit(1);
      const [row] = await drizzle
        .update(queue)
        .set({ status: 'processing', lockedUntil, lockedBy: workerId, attempt: sql`${queue.attempt} + 1` })
        .where(and(eq(queue.messageId, candidate), ready))
        .returning();
      return row;
    },

    /** Devuelve false si el lease ya no es de este worker. */
    async heartbeat(messageId: string, workerId: string, leaseMs: number): Promise<boolean> {
      const rows = await drizzle
        .update(queue)
        .set({ lockedUntil: new Date(Date.now() + leaseMs) })
        .where(and(eq(queue.messageId, messageId), eq(queue.lockedBy, workerId), eq(queue.status, 'processing')))
        .returning({ messageId: queue.messageId });
      return rows.length > 0;
    },

    async ack(messageId: string): Promise<void> {
      await drizzle.delete(queue).where(eq(queue.messageId, messageId));
    },

    async reschedule(messageId: string, delayMs: number, lastError?: string): Promise<void> {
      await drizzle
        .update(queue)
        .set({
          status: 'pending',
          notBefore: new Date(Date.now() + Math.max(0, delayMs)),
          lockedUntil: null,
          lockedBy: null,
          ...(lastError !== undefined ? { lastError } : {}),
        })
        .where(eq(queue.messageId, messageId));
    },

    async fail(messageId: string, lastError: string): Promise<void> {
      await drizzle.update(queue).set({ status: 'failed', lockedUntil: null, lockedBy: null, lastError }).where(eq(queue.messageId, messageId));
    },

    async get(messageId: string): Promise<QueueRow | undefined> {
      const [row] = await drizzle.select().from(queue).where(eq(queue.messageId, messageId)).limit(1);
      return row;
    },
  };
}

export type QueueStore = ReturnType<typeof createQueueStore>;
