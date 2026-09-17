// Smoke sin eve: ejercita el world directo contra WORKFLOW_LIBSQL_URL (file: o sqld).
//   WORKFLOW_LIBSQL_URL=libsql://172.20.0.1:8100 WORKFLOW_LIBSQL_AUTH_TOKEN=<jwt> npm run smoke
import { SPEC_VERSION_CURRENT } from '@workflow/world';
import { createClient } from '@libsql/client';
import { createWorld } from '../src/index.js';
import { createDrizzle } from '../src/drizzle/index.js';
import { ensureSchema } from '../src/migrations.js';
import { createQueueStore } from '../src/queue-store.js';

const url = process.env.WORKFLOW_LIBSQL_URL ?? process.env.EASYBITS_DB_URL;
if (!url) {
  console.error('WORKFLOW_LIBSQL_URL (o EASYBITS_DB_URL) es obligatoria');
  process.exit(1);
}
const authToken = process.env.WORKFLOW_LIBSQL_AUTH_TOKEN ?? process.env.EASYBITS_DB_TOKEN;
const enc = (s: string) => new TextEncoder().encode(s);
const check = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(`smoke: ${msg}`);
  console.log(`ok  ${msg}`);
};

const client = createClient({ url, authToken });
const t0 = Date.now();
await ensureSchema(client);
check(true, `schema listo en ${Date.now() - t0} ms (${url.replace(/\/\/.*@/, '//…@')})`);

const world = createWorld({ client, queuePollMs: 50 });
check(world.specVersion === SPEC_VERSION_CURRENT, `specVersion ${world.specVersion}`);

const created = await world.events.create(null, {
  eventType: 'run_created',
  specVersion: SPEC_VERSION_CURRENT,
  eventData: { deploymentId: 'dpl_smoke', workflowName: 'smoke/hello', input: enc('hola') },
});
const runId = created.run!.runId;
check(created.event?.eventId === 'evnt_00000000000000000000000001', `run ${runId} creado, primer slot`);

const started = await world.events.create(runId, { eventType: 'run_started', specVersion: SPEC_VERSION_CURRENT });
check(started.run?.status === 'running', 'run_started → running');

const step = await world.events.create(runId, {
  eventType: 'step_created',
  correlationId: 'step-1',
  specVersion: SPEC_VERSION_CURRENT,
  eventData: { stepName: 'greet', input: enc('x') },
});
check(step.step?.status === 'pending', 'step_created');
await world.events.create(runId, { eventType: 'step_started', correlationId: 'step-1', specVersion: SPEC_VERSION_CURRENT });
const done = await world.events.create(runId, {
  eventType: 'step_completed',
  correlationId: 'step-1',
  specVersion: SPEC_VERSION_CURRENT,
  eventData: { result: enc('done') },
});
check(done.step?.status === 'completed', 'step_started → step_completed');

const hook = await world.events.create(runId, {
  eventType: 'hook_created',
  correlationId: 'hook-1',
  specVersion: SPEC_VERSION_CURRENT,
  eventData: { token: `tok_${runId}` },
});
check(hook.hook?.hookId === 'hook-1', 'hook_created');
check((await world.hooks.getByToken(`tok_${runId}`)).runId === runId, 'hooks.getByToken');

await world.streams.write(runId, 'out', 'a');
await world.streams.writeMulti!(runId, 'out', ['b', 'c']);
await world.streams.close(runId, 'out');
const text = await new Response(await world.streams.get(runId, 'out')).text();
check(text === 'abc', `stream out = "${text}"`);

const store = createQueueStore(createDrizzle(client));
const { messageId } = await store.enqueue({ queueName: '__wkf_workflow_smoke', payload: Buffer.from('{"runId":"' + runId + '"}') });
const claimed = await store.claim('smoke-worker', 5_000);
check(claimed?.messageId === messageId, 'cola: enqueue → claim con lease');
check(!(await store.claim('otro', 5_000)), 'cola: segundo worker no lo reclama');
await store.ack(messageId);
check(!(await store.get(messageId)), 'cola: ack');

const completed = await world.events.create(runId, {
  eventType: 'run_completed',
  specVersion: SPEC_VERSION_CURRENT,
  eventData: { output: enc('fin') },
});
check(completed.run?.status === 'completed', 'run_completed');
const events = await world.events.list({ runId });
check(events.data.length === 7, `${events.data.length} eventos en bitácora, densos`);

await world.close();
console.log(`\nsmoke OK contra ${url.replace(/\/\/.*@/, '//…@')} en ${Date.now() - t0} ms`);
