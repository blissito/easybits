import { type Client, createClient } from '@libsql/client';
import { mintedSpecVersion, reenqueueActiveRuns, type World } from '@workflow/world';
import { type LibsqlWorldConfig, resolveConfig } from './config.js';
import { createDrizzle } from './drizzle/index.js';
import { ensureSchema } from './migrations.js';
import { createQueue } from './queue.js';
import { createRunStatusSignal } from './run-status.js';
import { createEventsStorage, createHooksStorage, createRunsStorage, createStepsStorage } from './storage.js';
import { createStreamer } from './streamer.js';

export type { LibsqlWorldConfig } from './config.js';
export { ensureSchema } from './migrations.js';
export * as schema from './drizzle/schema.js';

export type LibsqlWorld = World & { start(): Promise<void>; close(): Promise<void>; client: Client };

/**
 * World del Workflow SDK sobre libSQL/sqld. Port de @workflow/world-postgres
 * con cola por polling en tabla en lugar de graphile-worker.
 */
export function createWorld(userConfig: LibsqlWorldConfig = {}): LibsqlWorld {
  const config = resolveConfig(userConfig);
  const client = config.client ?? createClient({ url: config.url!, authToken: config.authToken });
  const drizzle = createDrizzle(client);
  const runStatus = createRunStatusSignal();
  const storage = {
    runs: createRunsStorage(drizzle, runStatus),
    events: createEventsStorage(drizzle, runStatus),
    hooks: createHooksStorage(drizzle),
    steps: createStepsStorage(drizzle),
  };
  const streamer = createStreamer(drizzle, { pollMs: config.streamPollMs });
  const queue = createQueue(config, drizzle);

  // Todo acceso a la base espera a que existan las tablas.
  const ready = ensureSchema(client);
  const gate = <T extends object>(obj: T): T =>
    new Proxy(obj, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== 'function') return value;
        return async (...args: unknown[]) => {
          await ready;
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });

  return {
    specVersion: mintedSpecVersion(),
    capabilities: {
      hookRetention: { active: true },
    },
    runs: gate(storage.runs),
    events: gate(storage.events),
    hooks: gate(storage.hooks),
    steps: gate(storage.steps),
    streams: gate(streamer.streams),
    ...(config.streamFlushIntervalMs !== undefined && { streamFlushIntervalMs: config.streamFlushIntervalMs }),
    queue: async (...args) => {
      await ready;
      return queue.queue(...args);
    },
    createQueueHandler: queue.createQueueHandler,
    getDeploymentId: queue.getDeploymentId,
    client,
    async start() {
      await ready;
      await queue.start();
      await reenqueueActiveRuns(storage.runs, queue.queue, 'eve-world', config.namespace);
    },
    async close() {
      await queue.close();
      await streamer.close();
      await runStatus.close();
      if (client !== config.client) client.close();
    },
  };
}

export default createWorld;
