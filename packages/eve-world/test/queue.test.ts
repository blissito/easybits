import { createClient } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { createDrizzle } from '../src/drizzle/index.js';
import { ensureSchema } from '../src/migrations.js';
import { createQueueStore } from '../src/queue-store.js';
import { createQueue, deserializePayload, type Deliver } from '../src/queue.js';
import { tempDbUrl } from './helpers.js';

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

async function setup() {
  const t = tempDbUrl();
  cleanup = t.cleanup;
  const client = createClient({ url: t.url });
  await ensureSchema(client);
  return { client, drizzle: createDrizzle(client), url: t.url };
}

describe('queue store (lease/TTL)', () => {
  it('encolar → reclamar con lease → ack borra el mensaje', async () => {
    const { drizzle } = await setup();
    const store = createQueueStore(drizzle);
    const { messageId } = await store.enqueue({ queueName: '__wkf_workflow_demo', payload: Buffer.from('{}') });
    const claimed = await store.claim('w1', 1000);
    expect(claimed?.messageId).toBe(messageId);
    expect(claimed?.status).toBe('processing');
    expect(claimed?.attempt).toBe(1);
    expect(claimed?.lockedBy).toBe('w1');
    expect(await store.heartbeat(messageId, 'w1', 1000)).toBe(true);
    expect(await store.heartbeat(messageId, 'otro', 1000)).toBe(false);
    await store.ack(messageId);
    expect(await store.get(messageId)).toBeUndefined();
  });

  it('dos workers no reclaman el mismo mensaje', async () => {
    const { drizzle } = await setup();
    const store = createQueueStore(drizzle);
    await store.enqueue({ queueName: '__wkf_workflow_demo', payload: Buffer.from('1') });
    await store.enqueue({ queueName: '__wkf_workflow_demo', payload: Buffer.from('2') });
    const [a, b, c] = await Promise.all([store.claim('w1', 5000), store.claim('w2', 5000), store.claim('w3', 5000)]);
    const ids = [a, b, c].filter(Boolean).map((r) => r!.messageId);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(await store.claim('w4', 5000)).toBeUndefined();
  });

  it('un lease vencido se re-entrega con attempt+1', async () => {
    const { drizzle } = await setup();
    const store = createQueueStore(drizzle);
    const { messageId } = await store.enqueue({ queueName: '__wkf_workflow_demo', payload: Buffer.from('x') });
    const first = await store.claim('w1', 50);
    expect(first?.messageId).toBe(messageId);
    expect(await store.claim('w2', 50)).toBeUndefined();
    await new Promise((r) => setTimeout(r, 80));
    const second = await store.claim('w2', 5000);
    expect(second?.messageId).toBe(messageId);
    expect(second?.attempt).toBe(2);
    expect(second?.lockedBy).toBe('w2');
  });

  it('idempotencyKey repetida devuelve el mismo messageId; delay respeta not_before', async () => {
    const { drizzle } = await setup();
    const store = createQueueStore(drizzle);
    const a = await store.enqueue({ queueName: '__wkf_workflow_demo', payload: Buffer.from('a'), idempotencyKey: 'k1' });
    const b = await store.enqueue({ queueName: '__wkf_workflow_demo', payload: Buffer.from('a'), idempotencyKey: 'k1' });
    expect(b.messageId).toBe(a.messageId);
    expect(b.deduplicated).toBe(true);
    const delayed = await store.enqueue({ queueName: '__wkf_workflow_demo', payload: Buffer.from('d'), delayMs: 60_000 });
    const claimed = await store.claim('w1', 1000);
    expect(claimed?.messageId).toBe(a.messageId);
    expect(await store.claim('w1', 1000)).toBeUndefined();
    expect((await store.get(delayed.messageId))?.status).toBe('pending');
  });
});

describe('queue worker', () => {
  it('entrega el mensaje al handler, reprograma con timeoutSeconds y hace ack al completar', async () => {
    const { drizzle } = await setup();
    const deliveries: Array<{ messageId: string; attempt: number; body: unknown }> = [];
    let calls = 0;
    const deliver: Deliver = async ({ messageId, attempt, body }) => {
      deliveries.push({ messageId, attempt, body: deserializePayload(body) });
      calls++;
      return calls === 1 ? { type: 'reschedule', timeoutSeconds: 0 } : { type: 'completed' };
    };
    const q = createQueue(resolveConfig({ queuePollMs: 10, queueLeaseMs: 2000, queueConcurrency: 2 }), drizzle, deliver);
    const { messageId } = await q.queue('__wkf_workflow_demo', { runId: 'wrun_1', payload: new Uint8Array([1, 2]) } as any);
    const deadline = Date.now() + 5000;
    while (deliveries.length < 2 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
    await q.close();
    expect(deliveries).toHaveLength(2);
    expect(deliveries[0].messageId).toBe(messageId);
    expect(deliveries[1].messageId).toBe(messageId); // mismo id en la re-entrega
    expect(deliveries.map((d) => d.attempt)).toEqual([1, 2]);
    expect((deliveries[0].body as any).payload).toBeInstanceOf(Uint8Array);
    expect(await q._store.get(messageId)).toBeUndefined();
  });

  it('createQueueHandler parsea cabeceras x-vqs y devuelve timeoutSeconds', async () => {
    const { drizzle } = await setup();
    const q = createQueue(resolveConfig({}), drizzle, async () => ({ type: 'completed' }));
    const handler = q.createQueueHandler('__wkf_workflow_', async (message, meta) => {
      expect(meta.attempt).toBe(3);
      expect((message as any).runId).toBe('wrun_x');
      return { timeoutSeconds: 7 };
    });
    const res = await handler(
      new Request('http://localhost/.well-known/workflow/v1/flow', {
        method: 'POST',
        headers: { 'x-vqs-queue-name': '__wkf_workflow_demo', 'x-vqs-message-id': 'msg_1', 'x-vqs-message-attempt': '3', 'content-type': 'application/json' },
        body: JSON.stringify({ runId: 'wrun_x' }),
      })
    );
    expect(await res.json()).toEqual({ timeoutSeconds: 7 });
    const bad = await handler(new Request('http://localhost/x', { method: 'POST', body: '{}' }));
    expect(bad.status).toBe(400);
    await q.close();
  });
});
