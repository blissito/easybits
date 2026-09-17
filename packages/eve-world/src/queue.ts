import { randomUUID } from 'node:crypto';
import {
  getQueueTopicPrefix,
  MessageId,
  type Queue,
  type QueueOptions,
  type QueuePayload,
  type QueuePrefix,
  QueuePayloadSchema,
  resolveQueueNamespace,
  type ValidQueueName,
  ValidQueueName as ValidQueueNameSchema,
  WorkflowInvokePayloadSchema,
} from '@workflow/world';
import { createNodeHttpAgents, destroyNodeHttpAgents, nodeHttpFetch } from '@workflow/world/node-http.js';
import { z } from 'zod/v4';
import type { ResolvedConfig } from './config.js';
import type { Drizzle } from './drizzle/index.js';
import { createQueueStore, type QueueRow } from './queue-store.js';
import { sleep } from './util.js';

const WORKFLOW_ROUTE_BASE = '/.well-known/workflow/v1';
// El runtime registra MAX_DELIVERIES_EXCEEDED en la entrega 49; esto es sólo tope de seguridad.
const MAX_ATTEMPTS = 64;
const RETRY_BACKOFF_MS = 5_000;
const MAX_REDELIVERY_DELAY_MS = 2_147_483_647;

// JSON que preserva Uint8Array con sobre etiquetado, igual que world-local/world-postgres.
export function serializePayload(value: unknown): Buffer {
  return Buffer.from(
    JSON.stringify(value, (_key, v) => (v instanceof Uint8Array ? { __type: 'Uint8Array', data: Buffer.from(v).toString('base64') } : v))
  );
}

export function deserializePayload(bytes: Uint8Array | string): unknown {
  const text = typeof bytes === 'string' ? bytes : Buffer.from(bytes).toString();
  return JSON.parse(text, (_key, v) =>
    v !== null && typeof v === 'object' && v.__type === 'Uint8Array' && typeof v.data === 'string'
      ? new Uint8Array(Buffer.from(v.data, 'base64'))
      : v
  );
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const HeaderParser = z.object({
  'x-vqs-queue-name': ValidQueueNameSchema,
  'x-vqs-message-id': MessageId,
  'x-vqs-message-attempt': z.coerce.number(),
});

export type DeliveryResult = { type: 'completed' } | { type: 'reschedule'; timeoutSeconds: number } | { type: 'error'; status: number; text: string };

export type Deliver = (args: { queueName: string; messageId: string; attempt: number; body: Buffer; headers?: Record<string, string> }) => Promise<DeliveryResult>;

export function createQueue(config: ResolvedConfig, drizzle: Drizzle, deliverOverride?: Deliver) {
  const store = createQueueStore(drizzle);
  const workerId = `wrk_${randomUUID()}`;
  const httpAgents = createNodeHttpAgents({ maxSockets: Infinity, keepAliveMs: 30_000 });

  let running = false;
  let closing = false;
  let loop: Promise<void> | null = null;
  const inflight = new Set<Promise<void>>();
  const inflightWorkflowRuns = new Map<string, Promise<unknown>>();
  const wake = new AbortController();

  const resolveServiceUrl = () => {
    const base = config.serviceUrl ?? (process.env.PORT ? `http://localhost:${process.env.PORT}` : undefined);
    if (!base) throw new Error('WORKFLOW_SERVICE_URL is required to deliver queue messages');
    return base.replace(/[?#].*$/, '').replace(/\/+$/, '');
  };

  const deliverOverHttp: Deliver = async ({ queueName, messageId, attempt, body, headers: extra }) => {
    const headers = new Headers({
      ...extra,
      'content-type': 'application/json',
      'x-vqs-queue-name': queueName,
      'x-vqs-message-id': messageId,
      'x-vqs-message-attempt': String(attempt),
    });
    const url = `${resolveServiceUrl()}${WORKFLOW_ROUTE_BASE}/flow`;
    // Sin deadline: la entrega ejecuta el cuerpo del workflow en línea.
    const response = await nodeHttpFetch(url, { method: 'POST', headers, body, agents: httpAgents, headersTimeoutMs: 0, bodyTimeoutMs: 0 });
    const text = await response.text();
    if (!response.ok) return { type: 'error', status: response.status, text };
    try {
      const timeoutSeconds = Number(JSON.parse(text).timeoutSeconds);
      if (Number.isFinite(timeoutSeconds) && timeoutSeconds >= 0) return { type: 'reschedule', timeoutSeconds };
    } catch {
      // cuerpo sin timeoutSeconds: entrega completada
    }
    return { type: 'completed' };
  };
  const deliver = deliverOverride ?? deliverOverHttp;

  async function processRow(row: QueueRow) {
    const messageId = row.messageId;
    // Heartbeat: extiende el lease mientras la entrega siga en curso.
    const hb = setInterval(() => {
      store.heartbeat(messageId, workerId, config.queueLeaseMs).then((ok) => {
        if (!ok) console.warn(`[eve-world] lease lost for ${messageId}; another worker may redeliver it`);
      }, () => {});
    }, Math.max(250, Math.floor(config.queueLeaseMs / 3)));
    hb.unref?.();
    try {
      const execute = async () => {
        const result = await deliver({
          queueName: row.queueName,
          messageId,
          attempt: row.attempt,
          body: Buffer.from(row.payload),
          headers: row.headers ?? undefined,
        });
        if (result.type === 'completed') {
          await store.ack(messageId);
          return;
        }
        if (result.type === 'reschedule') {
          await store.reschedule(messageId, Math.min(result.timeoutSeconds * 1000, MAX_REDELIVERY_DELAY_MS));
          return;
        }
        throw new Error(`[eve-world] queue delivery failed (${result.status}): ${result.text}`);
      };

      // Dos replays del mismo run no mutan su bitácora a la vez; los steps sí se abanican.
      let serializationKey: string | undefined;
      try {
        const body = deserializePayload(row.payload);
        const invoke = WorkflowInvokePayloadSchema.safeParse(body);
        if (invoke.success && !invoke.data.stepId) serializationKey = `workflow:${invoke.data.runId}`;
      } catch {
        // payload ilegible: se entrega igual y el handler decide
      }
      if (serializationKey) {
        const previous = inflightWorkflowRuns.get(serializationKey) ?? Promise.resolve();
        const execution = previous.catch(() => {}).then(execute);
        inflightWorkflowRuns.set(serializationKey, execution);
        try {
          await execution;
        } finally {
          if (inflightWorkflowRuns.get(serializationKey) === execution) inflightWorkflowRuns.delete(serializationKey);
        }
      } else {
        await execute();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[eve-world] queue message ${messageId} failed (attempt ${row.attempt})`, message);
      if (row.attempt >= MAX_ATTEMPTS) await store.fail(messageId, message).catch(() => {});
      else await store.reschedule(messageId, RETRY_BACKOFF_MS, message).catch(() => {});
    } finally {
      clearInterval(hb);
    }
  }

  async function runLoop() {
    while (running && !closing) {
      let claimed = false;
      if (inflight.size < config.queueConcurrency) {
        try {
          const row = await store.claim(workerId, config.queueLeaseMs);
          if (row) {
            claimed = true;
            const p = processRow(row).finally(() => inflight.delete(p));
            inflight.add(p);
          }
        } catch (err) {
          console.error('[eve-world] queue poll failed', err instanceof Error ? err.message : err);
        }
      }
      if (!claimed) await sleep(config.queuePollMs, wake.signal);
    }
  }

  async function start() {
    if (closing || running) return;
    running = true;
    loop = runLoop().catch((err) => console.error('[eve-world] queue loop crashed', err));
  }

  const queue: Queue['queue'] = async (queueName, message, opts?: QueueOptions) => {
    await start();
    const body = serializePayload(message);
    const { messageId } = await store.enqueue({
      queueName,
      payload: body,
      headers: opts?.headers,
      idempotencyKey: opts?.idempotencyKey,
      delayMs: opts?.delaySeconds ? opts.delaySeconds * 1000 : 0,
    });
    return { messageId: MessageId.parse(messageId) };
  };

  const createQueueHandler: Queue['createQueueHandler'] = (prefix: QueuePrefix, handler) => {
    return async (req: Request) => {
      const headers = HeaderParser.safeParse(Object.fromEntries(req.headers));
      if (!headers.success || !req.body) {
        return Response.json({ error: !req.body ? 'Missing request body' : 'Missing required headers' }, { status: 400 });
      }
      const queueName = headers.data['x-vqs-queue-name'] as ValidQueueName;
      const messageId = headers.data['x-vqs-message-id'] as MessageId;
      const attempt = headers.data['x-vqs-message-attempt'];
      if (!queueName.startsWith(prefix)) return Response.json({ error: 'Unhandled queue' }, { status: 400 });
      const body = deserializePayload(await readAll(req.body));
      try {
        const result = await handler(body, { attempt, queueName, messageId });
        if (typeof result?.timeoutSeconds === 'number') return Response.json({ timeoutSeconds: result.timeoutSeconds });
        return Response.json({ ok: true });
      } catch (error) {
        return Response.json(String(error), { status: 500 });
      }
    };
  };

  return {
    queue,
    createQueueHandler,
    async getDeploymentId() {
      return config.deploymentId;
    },
    start,
    async close() {
      closing = true;
      running = false;
      wake.abort();
      await loop;
      await Promise.allSettled([...inflight]);
      destroyNodeHttpAgents(httpAgents);
    },
    /** Prefijo de topics que consume este world (para diagnóstico). */
    topicPrefix: () => getQueueTopicPrefix('workflow', resolveQueueNamespace(config.namespace)),
    _store: store,
    _workerId: workerId,
  };
}

export type { QueuePayload };
export { QueuePayloadSchema };
