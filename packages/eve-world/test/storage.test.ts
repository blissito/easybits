import { SPEC_VERSION_CURRENT, slotToEventId } from '@workflow/world';
import { afterEach, describe, expect, it } from 'vitest';
import { bytes, makeWorld } from './helpers.js';

let ctx: ReturnType<typeof makeWorld>;
afterEach(async () => ctx && (await ctx.cleanup()));

async function createRun(world: ReturnType<typeof makeWorld>['world'], runId: string | null = null) {
  return world.events.create(runId, {
    eventType: 'run_created',
    specVersion: SPEC_VERSION_CURRENT,
    eventData: { deploymentId: 'dpl_test', workflowName: 'wf/demo', input: bytes('in'), attributes: { team: 'eve' } },
  });
}

describe('runs y eventos', () => {
  it('crea un run y su run_created ocupa el primer slot', async () => {
    ctx = makeWorld();
    const res = await createRun(ctx.world);
    expect(res.run?.status).toBe('pending');
    expect(res.run?.runId).toMatch(/^wrun_/);
    expect(res.event?.eventId).toBe(slotToEventId(1));
    const run = await ctx.world.runs.get(res.run!.runId);
    expect(run.workflowName).toBe('wf/demo');
    expect(run.attributes).toEqual({ team: 'eve' });
    expect(Buffer.from(run.input as Uint8Array).toString()).toBe('in');
    expect(ctx.world.specVersion).toBe(SPEC_VERSION_CURRENT);
  });

  it('los ids de evento son posiciones densas y ordenadas', async () => {
    ctx = makeWorld();
    const { run } = await createRun(ctx.world);
    const runId = run!.runId;
    const started = await ctx.world.events.create(runId, { eventType: 'run_started', specVersion: SPEC_VERSION_CURRENT });
    expect(started.event?.eventId).toBe(slotToEventId(2));
    expect(started.run?.status).toBe('running');
    // run_started precarga la bitácora completa
    expect((started as any).events?.map((e: any) => e.eventId)).toEqual([slotToEventId(1), slotToEventId(2)]);

    const created = await ctx.world.events.create(runId, {
      eventType: 'step_created',
      correlationId: 'step-1',
      specVersion: SPEC_VERSION_CURRENT,
      eventData: { stepName: 'fetch', input: bytes('a') },
    });
    expect(created.event?.eventId).toBe(slotToEventId(3));
    expect(created.step?.status).toBe('pending');

    const list = await ctx.world.events.list({ runId });
    expect(list.data.map((e) => e.eventId)).toEqual([1, 2, 3].map(slotToEventId));
    expect(list.hasMore).toBe(false);
  });

  it('step_created duplicado → EntityConflictError; ciclo del step completo', async () => {
    ctx = makeWorld();
    const { run } = await createRun(ctx.world);
    const runId = run!.runId;
    await ctx.world.events.create(runId, { eventType: 'run_started', specVersion: SPEC_VERSION_CURRENT });
    const stepEvent = { eventType: 'step_created' as const, correlationId: 's1', specVersion: SPEC_VERSION_CURRENT, eventData: { stepName: 'x', input: bytes('i') } };
    await ctx.world.events.create(runId, stepEvent);
    await expect(ctx.world.events.create(runId, stepEvent)).rejects.toMatchObject({ name: 'EntityConflictError' });

    const started = await ctx.world.events.create(runId, { eventType: 'step_started', correlationId: 's1', specVersion: SPEC_VERSION_CURRENT });
    expect(started.step?.status).toBe('running');
    expect(started.step?.attempt).toBe(1);
    const done = await ctx.world.events.create(runId, {
      eventType: 'step_completed',
      correlationId: 's1',
      specVersion: SPEC_VERSION_CURRENT,
      eventData: { result: bytes('ok') },
    });
    expect(done.step?.status).toBe('completed');
    const step = await ctx.world.steps.get(runId, 's1');
    expect(Buffer.from(step.output as Uint8Array).toString()).toBe('ok');
    const steps = await ctx.world.steps.list({ runId });
    expect(steps.data).toHaveLength(1);
  });

  it('step_started perezoso crea el step y sintetiza step_created antes', async () => {
    ctx = makeWorld();
    const { run } = await createRun(ctx.world);
    const runId = run!.runId;
    await ctx.world.events.create(runId, { eventType: 'run_started', specVersion: SPEC_VERSION_CURRENT });
    const res = await ctx.world.events.create(runId, {
      eventType: 'step_started',
      correlationId: 'lazy',
      specVersion: SPEC_VERSION_CURRENT,
      eventData: { stepName: 'lazy-step', input: bytes('z') },
    });
    expect(res.stepCreated).toBe(true);
    expect(res.step?.status).toBe('running');
    const list = await ctx.world.events.list({ runId });
    expect(list.data.slice(-2).map((e) => e.eventType)).toEqual(['step_created', 'step_started']);
    // el input viaja en step_created, no en step_started
    expect((list.data.at(-1) as any).eventData?.input).toBeUndefined();
  });

  it('run_completed es terminal: no admite otra transición ni entidades nuevas; waitForTerminalStatus despierta', async () => {
    ctx = makeWorld();
    const { run } = await createRun(ctx.world);
    const runId = run!.runId;
    await ctx.world.events.create(runId, { eventType: 'run_started', specVersion: SPEC_VERSION_CURRENT });
    const waiter = ctx.world.runs.waitForTerminalStatus!(runId, { timeoutMs: 5_000 });
    const completed = await ctx.world.events.create(runId, {
      eventType: 'run_completed',
      specVersion: SPEC_VERSION_CURRENT,
      eventData: { output: bytes('result') },
    });
    expect(completed.run?.status).toBe('completed');
    const awaited = await waiter;
    expect(awaited.status).toBe('completed');
    await expect(
      ctx.world.events.create(runId, { eventType: 'run_failed', specVersion: SPEC_VERSION_CURRENT, eventData: { error: bytes('e') } })
    ).rejects.toMatchObject({ name: 'EntityConflictError' });
    await expect(
      ctx.world.events.create(runId, { eventType: 'step_created', correlationId: 'late', specVersion: SPEC_VERSION_CURRENT, eventData: { stepName: 'l', input: bytes('') } })
    ).rejects.toMatchObject({ name: 'EntityConflictError' });
  });

  it('eventCount desfasado → bump-and-report devuelve los slots saltados', async () => {
    ctx = makeWorld();
    const { run } = await createRun(ctx.world);
    const runId = run!.runId;
    await ctx.world.events.create(runId, { eventType: 'run_started', specVersion: SPEC_VERSION_CURRENT });
    await ctx.world.events.create(runId, { eventType: 'step_created', correlationId: 'a', specVersion: SPEC_VERSION_CURRENT, eventData: { stepName: 'a', input: bytes('') } });
    // el escritor cree que hay 1 evento; hay 3, así que su evento cae en el 4 y se le reportan 2 y 3
    const res = await ctx.world.events.create(
      runId,
      { eventType: 'step_created', correlationId: 'b', specVersion: SPEC_VERSION_CURRENT, eventData: { stepName: 'b', input: bytes('') } },
      { eventCount: 1 }
    );
    expect(res.event?.eventId).toBe(slotToEventId(4));
    expect((res as any).events.map((e: any) => e.eventId)).toEqual([slotToEventId(2), slotToEventId(3)]);
    expect((res as any).cursor).toBeNull();
  });

  it('runs.list, getMany y atributos', async () => {
    ctx = makeWorld();
    const a = await createRun(ctx.world);
    const b = await createRun(ctx.world);
    const list = await ctx.world.runs.list({ workflowName: 'wf/demo' });
    expect(list.data.map((r) => r.runId).sort()).toEqual([a.run!.runId, b.run!.runId].sort());
    const many = await ctx.world.runs.getMany!([b.run!.runId, 'wrun_nope', a.run!.runId]);
    expect(many.map((r) => r?.runId ?? null)).toEqual([b.run!.runId, null, a.run!.runId]);
    const attrs = await ctx.world.runs.experimentalSetAttributes!(a.run!.runId, [{ key: 'env', value: 'prod' }, { key: 'team', value: null }]);
    expect(attrs.attributes).toEqual({ env: 'prod' });
    await expect(ctx.world.runs.get('wrun_missing')).rejects.toMatchObject({ name: 'WorkflowRunNotFoundError' });
  });
});

describe('hooks', () => {
  it('hook_created → getByToken; hook_received; hook_disposed libera el token', async () => {
    ctx = makeWorld();
    const { run } = await createRun(ctx.world);
    const runId = run!.runId;
    await ctx.world.events.create(runId, { eventType: 'run_started', specVersion: SPEC_VERSION_CURRENT });
    const created = await ctx.world.events.create(runId, {
      eventType: 'hook_created',
      correlationId: 'hook-1',
      specVersion: SPEC_VERSION_CURRENT,
      eventData: { token: 'tok-abc', metadata: bytes('m'), isWebhook: true },
    });
    expect(created.hook?.hookId).toBe('hook-1');
    const byToken = await ctx.world.hooks.getByToken('tok-abc');
    expect(byToken.runId).toBe(runId);
    expect(byToken.isWebhook).toBe(true);
    const listed = await ctx.world.hooks.list({ runId });
    expect(listed.data).toHaveLength(1);

    const received = await ctx.world.events.create(runId, {
      eventType: 'hook_received',
      correlationId: 'hook-1',
      specVersion: SPEC_VERSION_CURRENT,
      eventData: { token: 'tok-abc', payload: bytes('p') },
    });
    expect(received.event?.eventType).toBe('hook_received');

    // mismo token desde otro run → hook_conflict, no 409
    const other = await createRun(ctx.world);
    const conflict = await ctx.world.events.create(other.run!.runId, {
      eventType: 'hook_created',
      correlationId: 'hook-2',
      specVersion: SPEC_VERSION_CURRENT,
      eventData: { token: 'tok-abc' },
    });
    expect(conflict.event?.eventType).toBe('hook_conflict');

    await ctx.world.events.create(runId, { eventType: 'hook_disposed', correlationId: 'hook-1', specVersion: SPEC_VERSION_CURRENT });
    await expect(ctx.world.hooks.getByToken('tok-abc')).rejects.toMatchObject({ name: 'HookNotFoundError' });
    await expect(
      ctx.world.events.create(runId, { eventType: 'hook_received', correlationId: 'hook-1', specVersion: SPEC_VERSION_CURRENT, eventData: { payload: bytes('x') } })
    ).rejects.toMatchObject({ name: 'HookNotFoundError' });
  });
});

describe('streams', () => {
  it('write/writeMulti/close y lectura en vivo', async () => {
    ctx = makeWorld();
    const { run } = await createRun(ctx.world);
    const runId = run!.runId;
    await ctx.world.streams.write(runId, 'out', 'hello ');
    const reader = (await ctx.world.streams.get(runId, 'out')).getReader();
    const collected: string[] = [];
    const reading = (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        collected.push(Buffer.from(value).toString());
      }
    })();
    await ctx.world.streams.writeMulti!(runId, 'out', ['wor', bytes('ld')]);
    await ctx.world.streams.close(runId, 'out');
    await reading;
    expect(collected.join('')).toBe('hello world');
    expect(await ctx.world.streams.list(runId)).toEqual(['out']);
    const info = await ctx.world.streams.getInfo(runId, 'out');
    expect(info).toEqual({ tailIndex: 2, done: true });
    const chunks = await ctx.world.streams.getChunks(runId, 'out', { limit: 2 });
    expect(chunks.data.map((c) => c.index)).toEqual([0, 1]);
    expect(chunks.hasMore).toBe(true);
    const rest = await ctx.world.streams.getChunks(runId, 'out', { cursor: chunks.cursor!, limit: 2 });
    expect(rest.data.map((c) => Buffer.from(c.data).toString())).toEqual(['ld']);
    expect(rest.done).toBe(true);
    // startIndex negativo: los últimos 2 chunks
    const tail = await ctx.world.streams.get(runId, 'out', -2);
    const tailText = Buffer.from(await new Response(tail).arrayBuffer()).toString();
    expect(tailText).toBe('world');
  });
});
