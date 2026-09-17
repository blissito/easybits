import {
  EntityConflictError,
  HookNotFoundError,
  RunExpiredError,
  RunNotSupportedError,
  TooEarlyError,
  WorkflowRunNotFoundError,
  WorkflowWorldError,
} from '@workflow/errors';
import type {
  AttributeChange,
  CreateEventParams,
  Event,
  EventResult,
  ExperimentalSetAttributesResult,
  GetHookParams,
  GetStepParams,
  GetWorkflowRunParams,
  Hook,
  ListEventsByCorrelationIdParams,
  ListEventsParams,
  ListHooksParams,
  ListWorkflowRunsParams,
  ListWorkflowRunStepsParams,
  PaginatedResponse,
  ResolveData,
  Step,
  Storage,
  Wait,
  WaitForTerminalRunStatusParams,
  WorkflowRun,
} from '@workflow/world';
import {
  ATTRIBUTE_MAX_PER_RUN,
  AttributeValidationError,
  EVENT_ID_PREFIX,
  EVENT_ID_BODY_LENGTH,
  EventSchema,
  eventIdToSlot,
  FIRST_EVENT_SLOT,
  getMaxEventsPerRun,
  HookSchema,
  isChildEntityCreationEvent,
  isChildEntityCreationEventType,
  isHookEventRequiringExistence,
  isLegacySpecVersion,
  isTerminalRunEventType,
  isTerminalStepStatus,
  isTerminalWorkflowRunStatus,
  requiresNewerWorld,
  SPEC_VERSION_CURRENT,
  StepSchema,
  slotToEventId,
  stripEventDataRefs,
  TERMINAL_STEP_STATUSES,
  TERMINAL_WORKFLOW_RUN_STATUSES,
  validateAttributeChanges,
  validateUlidTimestamp,
  WorkflowRunSchema,
} from '@workflow/world';
import { and, asc, desc, eq, exists, gt, inArray, isNull, lt, lte, notExists, notInArray, or, sql } from 'drizzle-orm';
import { monotonicFactory } from 'ulid';
import { type Db, type Drizzle, Schema } from './drizzle/index.js';
import { purgeRunUserDataIfZeroRetention } from './retention.js';
import { getRunStatusPollIntervalMs, type RunStatusSignal } from './run-status.js';
import { compact, isUniqueViolation, map } from './util.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Sólo para runs legacy (pre-slot). */
const legacyEventUlid = monotonicFactory();

// Con SQLite el escritor es único (BEGIN IMMEDIATE), así que la posición que
// calcula el INSERT nunca compite con otro escritor dentro de la misma
// transacción; los reintentos cubren inserts sueltos que se cruzan entre
// procesos sobre sqld.
const SLOT_INSERT_MAX_ATTEMPTS = 40;
const SLOT_INSERT_IMMEDIATE_ATTEMPTS = 8;
const SLOT_INSERT_BASE_DELAY_MS = 2;
const SLOT_INSERT_MAX_DELAY_MS = 40;

const ENTITY_CREATION_UNIQUE_COLUMNS = ['workflow_events.run_id', 'workflow_events.correlation_id', 'workflow_events.type'];

type EventRow = typeof Schema.events.$inferSelect;
type RunRow = typeof Schema.runs.$inferSelect;
type StepRow = typeof Schema.steps.$inferSelect;
type HookRow = typeof Schema.hooks.$inferSelect;

/**
 * Posición del siguiente slot del run, calculada dentro del INSERT que la
 * ocupa: `evnt_` + (máximo actual + 1) con ceros a la izquierda. Equivalente
 * al `lpad` de Postgres con `printf('%026d')`.
 */
function nextSlotId(runId: string) {
  const bodyFrom = sql.raw(String(EVENT_ID_PREFIX.length + 1));
  const fmt = sql.raw(`'%0${EVENT_ID_BODY_LENGTH}d'`);
  const noEvents = sql.raw(String(FIRST_EVENT_SLOT - 1));
  return sql<string>`${EVENT_ID_PREFIX} || printf(${fmt}, coalesce((select cast(substr(prev.id, ${bodyFrom}) as integer) from ${Schema.events} prev where prev.run_id = ${runId} order by prev.id desc limit 1), ${noEvents}) + 1)`;
}

async function allocateEventId(db: Db, runId: string) {
  const [row] = await db
    .select({ runId: Schema.eventSlots.runId })
    .from(Schema.eventSlots)
    .where(eq(Schema.eventSlots.runId, runId))
    .limit(1);
  return row ? nextSlotId(runId) : `wevt_${legacyEventUlid()}`;
}

type EventInsert = Omit<typeof Schema.events.$inferInsert, 'eventId'> & {
  eventId: string | ReturnType<typeof nextSlotId>;
};

/** Inserta una fila de evento reintentando mientras la posición esté ocupada. */
async function insertEventRow(db: Db, values: EventInsert) {
  const runId = values.runId;
  const allocates = typeof values.eventId !== 'string';
  for (let attempt = 0; ; attempt++) {
    const [row] = await db
      .insert(Schema.events)
      .values(values as typeof Schema.events.$inferInsert)
      .onConflictDoNothing({ target: [Schema.events.runId, Schema.events.eventId] })
      .returning({ eventId: Schema.events.eventId, createdAt: Schema.events.createdAt });
    if (row) return row;
    if (!allocates) return undefined;
    if (attempt >= SLOT_INSERT_MAX_ATTEMPTS) {
      throw new WorkflowWorldError(
        `Could not allocate an event slot for run "${runId}" after ${SLOT_INSERT_MAX_ATTEMPTS} attempts`,
        { status: 503 }
      );
    }
    if (attempt >= SLOT_INSERT_IMMEDIATE_ATTEMPTS) {
      const delay = Math.min(SLOT_INSERT_MAX_DELAY_MS, SLOT_INSERT_BASE_DELAY_MS * 2 ** (attempt - SLOT_INSERT_IMMEDIATE_ATTEMPTS));
      await new Promise((r) => setTimeout(r, Math.random() * delay));
    }
  }
}

/** Marca el run como numerado por slot y devuelve el id de su primer evento. */
async function openEventSlots(db: Db, runId: string) {
  await db.insert(Schema.eventSlots).values({ runId }).onConflictDoNothing();
  return slotToEventId(FIRST_EVENT_SLOT);
}

function parseEventRow(row: EventRow, resolveData: ResolveData): Event {
  return stripEventDataRefs(EventSchema.parse(compact(row)), resolveData);
}

/** Mitad "report" de bump-and-report: eventos entre el slot pedido y el ocupado. */
async function reportSkippedSlots(db: Db, runId: string, committedEventId: string, askedFor: number, resolveData: ResolveData) {
  const committedSlot = eventIdToSlot(committedEventId);
  if (committedSlot === null || askedFor < FIRST_EVENT_SLOT || committedSlot <= askedFor + 1) return undefined;
  const rows = await db
    .select()
    .from(Schema.events)
    .where(and(eq(Schema.events.runId, runId), gt(Schema.events.eventId, slotToEventId(askedFor)), lt(Schema.events.eventId, committedEventId)))
    .orderBy(Schema.events.eventId);
  const events = rows.map((row) => parseEventRow(row, resolveData));
  return { events, hasMore: events.length < committedSlot - askedFor - 1 };
}

function getHookRetentionLimitMs() {
  const days = Number(process.env.WORKFLOW_HOOK_RETENTION_LIMIT_DAYS ?? 30);
  if (!Number.isFinite(days) || days <= 0) {
    throw new WorkflowWorldError('WORKFLOW_HOOK_RETENTION_LIMIT_DAYS must be a positive number', { status: 400 });
  }
  return days * DAY_MS;
}

function parseRunRow(row: RunRow): WorkflowRun {
  return WorkflowRunSchema.parse(compact(row));
}

function parseStepRow(row: StepRow): Step {
  return StepSchema.parse(compact(row));
}

function parseHookRow(row: HookRow): Hook {
  const parsed = HookSchema.parse(compact(row));
  parsed.isWebhook ??= true;
  return parsed;
}

function filterRunData(run: WorkflowRun, resolveData: ResolveData) {
  if (resolveData === 'none') {
    const { input: _, output: __, ...rest } = run;
    return { input: undefined, output: undefined, ...rest };
  }
  return run;
}

function filterStepData(step: Step, resolveData: ResolveData) {
  if (resolveData === 'none') {
    const { input: _, output: __, ...rest } = step;
    return { input: undefined, output: undefined, ...rest };
  }
  return step;
}

function filterHookData(hook: Hook, resolveData: ResolveData) {
  if (resolveData === 'none' && 'metadata' in hook) {
    const { metadata: _, ...rest } = hook;
    return { metadata: undefined, ...rest };
  }
  return hook;
}

/** Aplica cambios de atributos en JS (SQLite no tiene jsonb_set). */
function mergeAttributes(existing: Record<string, string>, changes: AttributeChange[]) {
  const next = { ...existing };
  for (const { key, value } of changes) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

export function createRunsStorage(drizzle: Drizzle, runStatus?: RunStatusSignal): Storage['runs'] {
  const { runs } = Schema;

  const getRun = async (id: string, params?: GetWorkflowRunParams) => {
    const [value] = await drizzle.select().from(runs).where(eq(runs.runId, id)).limit(1);
    if (!value) throw new WorkflowRunNotFoundError(id);
    return filterRunData(parseRunRow(value), params?.resolveData ?? 'all');
  };

  return {
    get: getRun as Storage['runs']['get'],
    waitForTerminalStatus: (async (id: string, params?: WaitForTerminalRunStatusParams) => {
      const deadline = Date.now() + (params?.timeoutMs ?? 0);
      while (true) {
        const run = await getRun(id, params);
        if (isTerminalWorkflowRunStatus(run.status)) return run;
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0 || params?.signal?.aborted) return run;
        const waitMs = Math.min(remainingMs, getRunStatusPollIntervalMs());
        if (runStatus) await runStatus.wait(id, waitMs, params?.signal);
        else await new Promise((r) => setTimeout(r, waitMs));
      }
    }) as Storage['runs']['waitForTerminalStatus'],
    getMany: (async (ids: readonly string[], params?: GetWorkflowRunParams) => {
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) return [];
      const values = await drizzle.select().from(runs).where(inArray(runs.runId, uniqueIds));
      const resolveData = params?.resolveData ?? 'all';
      const byId = new Map(values.map((v) => [v.runId, filterRunData(parseRunRow(v), resolveData)]));
      return ids.map((id) => byId.get(id) ?? null);
    }) as Storage['runs']['getMany'],
    list: (async (params?: ListWorkflowRunsParams) => {
      const limit = params?.pagination?.limit ?? 20;
      const fromCursor = params?.pagination?.cursor;
      const all = await drizzle
        .select()
        .from(runs)
        .where(
          and(
            map(fromCursor, (c) => lt(runs.runId, c)),
            map(params?.workflowName, (wf) => eq(runs.workflowName, wf)),
            map(params?.status, (s) => (Array.isArray(s) ? inArray(runs.status, s) : eq(runs.status, s)))
          )
        )
        .orderBy(desc(runs.runId))
        .limit(limit + 1);
      const values = all.slice(0, limit);
      const resolveData = params?.resolveData ?? 'all';
      return {
        data: values.map((v) => filterRunData(parseRunRow(v), resolveData)),
        hasMore: all.length > limit,
        cursor: values.at(-1)?.runId ?? null,
      };
    }) as Storage['runs']['list'],
    async experimentalSetAttributes(runId, changes, options): Promise<ExperimentalSetAttributesResult> {
      // Transacción de escritura: lectura + merge + escritura sin carreras.
      return drizzle.transaction(async (tx) => {
        const [existing] = await tx.select({ attributes: runs.attributes }).from(runs).where(eq(runs.runId, runId)).limit(1);
        if (!existing) throw new WorkflowRunNotFoundError(runId);
        validateAttributeChanges(changes, {
          existingKeys: Object.keys(existing.attributes ?? {}),
          allowReservedAttributes: options?.allowReservedAttributes,
        });
        const merged = mergeAttributes(existing.attributes ?? {}, changes);
        if (Object.keys(merged).length > ATTRIBUTE_MAX_PER_RUN) {
          throw new AttributeValidationError(`Run attribute count would exceed limit ${ATTRIBUTE_MAX_PER_RUN}`);
        }
        await tx.update(runs).set({ attributes: merged, updatedAt: new Date() }).where(eq(runs.runId, runId));
        return { attributes: merged };
      });
    },
  };
}

/** Runs legacy (specVersion < 2): sólo cancelación directa y eventos de bitácora. */
async function handleLegacyEvent(
  drizzle: Drizzle,
  runStatus: RunStatusSignal | undefined,
  runId: string,
  eventId: string,
  data: any,
  currentRun: { specVersion: number | null },
  params?: CreateEventParams
): Promise<EventResult> {
  const resolveData = params?.resolveData ?? 'all';
  switch (data.eventType) {
    case 'run_cancelled': {
      const now = new Date();
      await drizzle.update(Schema.runs).set({ status: 'cancelled', completedAt: now, updatedAt: now }).where(eq(Schema.runs.runId, runId));
      await drizzle.delete(Schema.hooks).where(eq(Schema.hooks.runId, runId));
      await drizzle.delete(Schema.waits).where(eq(Schema.waits.runId, runId));
      const [updatedRun] = await drizzle.select().from(Schema.runs).where(eq(Schema.runs.runId, runId)).limit(1);
      await purgeRunUserDataIfZeroRetention(drizzle, runId, updatedRun?.attributes, now);
      runStatus?.notify(runId);
      return { run: updatedRun ? (filterRunData(parseRunRow(updatedRun), resolveData) as WorkflowRun) : undefined };
    }
    case 'wait_completed':
    case 'hook_received': {
      const insertLegacyEvent = (db: Db) =>
        db
          .insert(Schema.events)
          .values({
            runId,
            eventId,
            correlationId: data.correlationId,
            eventType: data.eventType,
            eventData: 'eventData' in data ? data.eventData : undefined,
            specVersion: SPEC_VERSION_CURRENT,
          })
          .returning({ createdAt: Schema.events.createdAt });
      const [insertedEvent] =
        data.eventType === 'hook_received'
          ? await drizzle.transaction(async (tx) => {
              const [runRow] = await tx.select({ status: Schema.runs.status }).from(Schema.runs).where(eq(Schema.runs.runId, runId)).limit(1);
              if (!runRow) throw new WorkflowRunNotFoundError(runId);
              if (isTerminalWorkflowRunStatus(runRow.status)) {
                throw new RunExpiredError(`Workflow run "${runId}" is already in terminal state "${runRow.status}"`);
              }
              return insertLegacyEvent(tx);
            })
          : await insertLegacyEvent(drizzle);
      const event = EventSchema.parse({ ...data, ...insertedEvent, runId, eventId });
      return { event: stripEventDataRefs(event, resolveData) };
    }
    default:
      throw new Error(
        `Event type '${data.eventType}' not supported for legacy runs (specVersion: ${currentRun.specVersion || 'undefined'}). Please upgrade @workflow packages.`
      );
  }
}

export function createEventsStorage(drizzle: Drizzle, runStatus?: RunStatusSignal): Storage['events'] {
  const hookRetentionLimitMs = getHookRetentionLimitMs();
  const ulid = monotonicFactory();
  const { events } = Schema;

  const ownerRunIsTerminal = drizzle
    .select({ runId: Schema.runs.runId })
    .from(Schema.runs)
    .where(and(eq(Schema.runs.runId, Schema.hooks.runId), inArray(Schema.runs.status, TERMINAL_WORKFLOW_RUN_STATUSES)));
  const hookRetentionEnded = () => or(isNull(Schema.hooks.tokenRetentionUntil), lte(Schema.hooks.tokenRetentionUntil, new Date()));

  const getRunForValidation = (db: Db, runId: string) =>
    db.select({ status: Schema.runs.status, specVersion: Schema.runs.specVersion }).from(Schema.runs).where(eq(Schema.runs.runId, runId)).limit(1);
  const getStepForValidation = (db: Db, runId: string, stepId: string) =>
    db
      .select({ status: Schema.steps.status, startedAt: Schema.steps.startedAt, retryAfter: Schema.steps.retryAfter })
      .from(Schema.steps)
      .where(and(eq(Schema.steps.runId, runId), eq(Schema.steps.stepId, stepId)))
      .limit(1);
  const getHookByToken = (token: string) =>
    drizzle
      .select({ hookId: Schema.hooks.hookId, runId: Schema.hooks.runId })
      .from(Schema.hooks)
      .where(and(eq(Schema.hooks.token, token), or(gt(Schema.hooks.tokenRetentionUntil, new Date()), notExists(ownerRunIsTerminal))))
      .limit(1);
  const getCorrelatedEvent = (db: Db, runId: string, correlationId: string, eventType: string) =>
    db
      .select({ eventId: events.eventId })
      .from(events)
      .where(and(eq(events.runId, runId), eq(events.correlationId, correlationId), eq(events.eventType, eventType as any)))
      .limit(1);

  return {
    async create(runId: string | null, data: any, params?: CreateEventParams): Promise<any> {
      if (
        data.eventType === 'hook_created' &&
        data.eventData.tokenRetentionUntil !== undefined &&
        data.eventData.tokenRetentionUntil.getTime() > Date.now() + hookRetentionLimitMs
      ) {
        throw new WorkflowWorldError(`Hook minimum retention cannot exceed ${hookRetentionLimitMs / DAY_MS} days in the libSQL World.`, {
          status: 400,
        });
      }

      let eventId: string | undefined;
      let value: { createdAt: Date } | undefined;
      const getEventId = async (db: Db = drizzle) => eventId ?? (await allocateEventId(db, effectiveRunId));

      let effectiveRunId: string;
      if (data.eventType === 'run_created' && (!runId || runId === '')) {
        effectiveRunId = `wrun_${ulid()}`;
      } else if (!runId) {
        throw new Error('runId is required for non-run_created events');
      } else {
        effectiveRunId = runId;
      }
      if (data.eventType === 'run_created' && runId && runId !== '') {
        const validationError = validateUlidTimestamp(effectiveRunId, 'wrun_');
        if (validationError) throw new WorkflowWorldError(validationError);
      }

      const effectiveSpecVersion = data.specVersion ?? SPEC_VERSION_CURRENT;
      let run: WorkflowRun | undefined;
      let step: Step | undefined;
      let hook: Hook | undefined;
      let wait: Wait | undefined;
      let stepCreatedLazily = false;
      const now = new Date();
      const terminalStepStatuses = [...TERMINAL_STEP_STATUSES];

      // ---------- VALIDACIÓN ----------
      let currentRun: { status: WorkflowRun['status']; specVersion: number | null } | null = null;
      const skipRunValidationEvents = ['step_completed', 'step_retrying'];
      if (data.eventType !== 'run_created' && !skipRunValidationEvents.includes(data.eventType)) {
        const [runValue] = await getRunForValidation(drizzle, effectiveRunId);
        currentRun = runValue ?? null;
        // Arranque resiliente: run_started sobre un run inexistente con eventData lo crea.
        if (data.eventType === 'run_started' && !currentRun && 'eventData' in data && data.eventData) {
          const runInputData = data.eventData;
          if (runInputData.deploymentId && runInputData.workflowName && runInputData.input !== undefined) {
            validateAttributeChanges(
              Object.entries(runInputData.attributes ?? {}).map(([key, value]) => ({ key, value: value as string })),
              { allowReservedAttributes: runInputData.allowReservedAttributes === true }
            );
            const { deploymentId, workflowName } = runInputData;
            const createdRun = await drizzle.transaction(async (tx) => {
              const [inserted] = await tx
                .insert(Schema.runs)
                .values({
                  runId: effectiveRunId,
                  deploymentId,
                  workflowName,
                  specVersion: effectiveSpecVersion,
                  input: runInputData.input,
                  executionContext: runInputData.executionContext,
                  attributes: runInputData.attributes ?? {},
                  encryptionPublicKey: runInputData.encryptionPublicKey,
                  status: 'pending',
                })
                .onConflictDoNothing()
                .returning();
              if (!inserted) return undefined;
              const runCreatedEventId = await openEventSlots(tx, effectiveRunId);
              await tx.insert(events).values({
                runId: effectiveRunId,
                eventId: runCreatedEventId,
                eventType: 'run_created',
                eventData: {
                  deploymentId: runInputData.deploymentId,
                  workflowName: runInputData.workflowName,
                  input: runInputData.input,
                  executionContext: runInputData.executionContext,
                  attributes: runInputData.attributes,
                  allowReservedAttributes: runInputData.allowReservedAttributes,
                  encryptionPublicKey: runInputData.encryptionPublicKey,
                } as any,
                specVersion: effectiveSpecVersion,
              });
              return inserted;
            });
            if (createdRun) {
              currentRun = { status: 'pending', specVersion: effectiveSpecVersion };
            } else {
              const [runValue2] = await getRunForValidation(drizzle, effectiveRunId);
              currentRun = runValue2 ?? null;
            }
          }
        }
      }

      if (currentRun) {
        if (requiresNewerWorld(currentRun.specVersion)) {
          throw new RunNotSupportedError(currentRun.specVersion as number, SPEC_VERSION_CURRENT);
        }
        if (isLegacySpecVersion(currentRun.specVersion)) {
          return handleLegacyEvent(drizzle, runStatus, effectiveRunId, `wevt_${legacyEventUlid()}`, data, currentRun, params);
        }
      }
      if (!currentRun && (data.eventType === 'attr_set' || data.eventType === 'run_started')) {
        throw new WorkflowRunNotFoundError(effectiveRunId);
      }

      const createsChildEntity = isChildEntityCreationEvent(data);
      const lazyStepStart = createsChildEntity && data.eventType === 'step_started';

      if (currentRun && isTerminalWorkflowRunStatus(currentRun.status)) {
        if (data.eventType === 'run_cancelled' && currentRun.status === 'cancelled') {
          const [fullRun] = await drizzle.select().from(Schema.runs).where(eq(Schema.runs.runId, effectiveRunId)).limit(1);
          const inserted = await insertEventRow(drizzle, {
            runId: effectiveRunId,
            eventId: await getEventId(),
            correlationId: data.correlationId,
            eventType: data.eventType,
            eventData: 'eventData' in data ? data.eventData : undefined,
            specVersion: effectiveSpecVersion,
          });
          if (!inserted) throw new EntityConflictError(`run_cancelled for run "${effectiveRunId}" could not be created`);
          const parsed = EventSchema.parse({ ...data, ...inserted, runId: effectiveRunId });
          return {
            event: stripEventDataRefs(parsed, params?.resolveData ?? 'all'),
            run: fullRun ? parseRunRow(fullRun) : undefined,
          };
        }
        if (data.eventType === 'run_started') {
          throw new RunExpiredError(`Workflow run "${effectiveRunId}" is already in terminal state "${currentRun.status}"`);
        }
        if (isTerminalRunEventType(data.eventType)) {
          throw new EntityConflictError(`Cannot transition run from terminal state "${currentRun.status}"`);
        }
        if (createsChildEntity) {
          throw new EntityConflictError(`Cannot create new entities on run in terminal state "${currentRun.status}"`);
        }
        if (data.eventType === 'attr_set') {
          throw new EntityConflictError(`Cannot set attributes on run in terminal state "${currentRun.status}"`);
        }
      }

      let validatedStep: { status: Step['status']; startedAt: Date | null; retryAfter: Date | null } | null = null;
      if (['step_started', 'step_retrying'].includes(data.eventType) && data.correlationId) {
        const [existingStep] = await getStepForValidation(drizzle, effectiveRunId, data.correlationId);
        validatedStep = existingStep ?? null;
        if (!validatedStep && !lazyStepStart) throw new WorkflowWorldError(`Step "${data.correlationId}" not found`);
        if (lazyStepStart && validatedStep) throw new EntityConflictError(`Step "${data.correlationId}" already created`);
        if (validatedStep) {
          if (isTerminalStepStatus(validatedStep.status)) {
            throw new EntityConflictError(`Cannot modify step in terminal state "${validatedStep.status}"`);
          }
          if (currentRun && isTerminalWorkflowRunStatus(currentRun.status)) {
            if (validatedStep.status !== 'running' || data.eventType === 'step_started') {
              throw new RunExpiredError(
                `Cannot ${data.eventType === 'step_started' ? 'start' : 'modify non-running'} step on run in terminal state "${currentRun.status}"`
              );
            }
          }
        }
      }

      if (isHookEventRequiringExistence(data.eventType) && data.correlationId) {
        const [existingHook] = await drizzle
          .select({ hookId: Schema.hooks.hookId })
          .from(Schema.hooks)
          .where(eq(Schema.hooks.hookId, data.correlationId))
          .limit(1);
        if (!existingHook) throw new HookNotFoundError(data.correlationId);
      }

      // ---------- ENTIDADES ----------
      if (data.eventType === 'run_created') {
        const eventData = data.eventData;
        validateAttributeChanges(
          Object.entries(eventData.attributes ?? {}).map(([key, value]) => ({ key, value: value as string })),
          { allowReservedAttributes: eventData.allowReservedAttributes === true }
        );
        const created = await drizzle.transaction(async (tx) => {
          const [runValue] = await tx
            .insert(Schema.runs)
            .values({
              runId: effectiveRunId,
              deploymentId: eventData.deploymentId,
              workflowName: eventData.workflowName,
              specVersion: effectiveSpecVersion,
              input: eventData.input,
              executionContext: eventData.executionContext,
              attributes: eventData.attributes ?? {},
              encryptionPublicKey: eventData.encryptionPublicKey,
              status: 'pending',
            })
            .onConflictDoNothing()
            .returning();
          if (!runValue) throw new EntityConflictError(`Workflow run "${effectiveRunId}" already exists`);
          const firstEventId = await openEventSlots(tx, effectiveRunId);
          const eventValue = await insertEventRow(tx, {
            runId: effectiveRunId,
            eventId: firstEventId,
            correlationId: data.correlationId,
            eventType: 'run_created',
            eventData,
            specVersion: effectiveSpecVersion,
          });
          if (!eventValue) throw new EntityConflictError(`Workflow run "${effectiveRunId}" already exists`);
          return { runValue, eventValue };
        });
        eventId = created.eventValue.eventId;
        value = created.eventValue;
        run = parseRunRow(created.runValue);
      }

      if (data.eventType === 'run_started') {
        if (currentRun?.status === 'running') {
          const [fullRun] = await drizzle.select().from(Schema.runs).where(eq(Schema.runs.runId, effectiveRunId)).limit(1);
          if (fullRun) return { run: parseRunRow(fullRun) };
        }
        const [runValue] = await drizzle
          .update(Schema.runs)
          .set({ status: 'running', startedAt: now, updatedAt: now })
          .where(eq(Schema.runs.runId, effectiveRunId))
          .returning();
        if (runValue) run = parseRunRow(runValue);
      }

      const terminalRunUpdate = async (set: Partial<typeof Schema.runs.$inferInsert>) => {
        const [runValue] = await drizzle
          .update(Schema.runs)
          .set({ ...set, completedAt: now, updatedAt: now })
          .where(and(eq(Schema.runs.runId, effectiveRunId), notInArray(Schema.runs.status, TERMINAL_WORKFLOW_RUN_STATUSES)))
          .returning();
        if (runValue) {
          run = parseRunRow(runValue);
          return;
        }
        const [existing] = await getRunForValidation(drizzle, effectiveRunId);
        if (!existing) throw new WorkflowRunNotFoundError(effectiveRunId);
        if (isTerminalWorkflowRunStatus(existing.status)) {
          throw new EntityConflictError(`Cannot transition run from terminal state "${existing.status}"`);
        }
      };
      if (data.eventType === 'run_completed') await terminalRunUpdate({ status: 'completed', output: data.eventData.output });
      if (data.eventType === 'run_failed') {
        await terminalRunUpdate({ status: 'failed', error: data.eventData.error, errorCode: data.eventData.errorCode });
      }
      if (data.eventType === 'run_cancelled') await terminalRunUpdate({ status: 'cancelled' });

      if (isTerminalRunEventType(data.eventType)) {
        // Los hooks con retención mínima siguen visibles; el resto y las waits se van.
        await drizzle.delete(Schema.hooks).where(and(eq(Schema.hooks.runId, effectiveRunId), hookRetentionEnded()));
        await drizzle.delete(Schema.waits).where(eq(Schema.waits.runId, effectiveRunId));
      }

      if (data.eventType === 'attr_set') {
        const { changes, allowReservedAttributes } = data.eventData;
        if (data.correlationId && data.eventData.writer.type === 'workflow') {
          const [duplicate] = await getCorrelatedEvent(drizzle, effectiveRunId, data.correlationId, 'attr_set');
          if (duplicate) {
            throw new EntityConflictError(`attr_set for correlationId "${data.correlationId}" already exists in run "${effectiveRunId}"`);
          }
        }
        const runValue = await drizzle.transaction(async (tx) => {
          const [existing] = await tx.select({ attributes: Schema.runs.attributes }).from(Schema.runs).where(eq(Schema.runs.runId, effectiveRunId)).limit(1);
          if (!existing) throw new WorkflowRunNotFoundError(effectiveRunId);
          validateAttributeChanges(changes, {
            existingKeys: Object.keys(existing.attributes ?? {}),
            allowReservedAttributes: allowReservedAttributes === true,
          });
          const merged = mergeAttributes(existing.attributes ?? {}, changes);
          if (Object.keys(merged).length > ATTRIBUTE_MAX_PER_RUN) {
            throw new AttributeValidationError(`Run attribute count would exceed limit ${ATTRIBUTE_MAX_PER_RUN}`);
          }
          const [updated] = await tx
            .update(Schema.runs)
            .set({ attributes: merged, updatedAt: now })
            .where(eq(Schema.runs.runId, effectiveRunId))
            .returning();
          if (!updated) throw new WorkflowRunNotFoundError(effectiveRunId);
          return updated;
        });
        run = parseRunRow(runValue);
      }

      // run_started no guarda eventData; step_started perezoso guarda todo menos `input`.
      let storedEventData: unknown;
      if (data.eventType === 'run_started') {
        storedEventData = undefined;
      } else if ('eventData' in data && data.eventData) {
        if (data.eventType === 'step_started' && 'input' in data.eventData) {
          const { input: _strippedInput, ...rest } = data.eventData;
          storedEventData = rest;
        } else {
          storedEventData = data.eventData;
        }
      }

      if (data.eventType === 'step_started') {
        value = await drizzle.transaction(async (tx) => {
          if (lazyStepStart && !validatedStep) {
            const lazyData = data.eventData;
            const [inserted] = await tx
              .insert(Schema.steps)
              .values({
                runId: effectiveRunId,
                stepId: data.correlationId,
                stepName: lazyData.stepName,
                input: lazyData.input,
                status: 'pending',
                attempt: 0,
                specVersion: effectiveSpecVersion,
              })
              .onConflictDoNothing()
              .returning({ stepId: Schema.steps.stepId });
            if (!inserted) throw new EntityConflictError(`Step "${data.correlationId}" already created`);
            try {
              await insertEventRow(tx, {
                runId: effectiveRunId,
                eventId: await allocateEventId(tx, effectiveRunId),
                correlationId: data.correlationId,
                eventType: 'step_created',
                eventData: { stepName: lazyData.stepName, input: lazyData.input } as any,
                specVersion: effectiveSpecVersion,
              });
            } catch (err) {
              if (!isUniqueViolation(err, ...ENTITY_CREATION_UNIQUE_COLUMNS)) throw err;
            }
            stepCreatedLazily = true;
          }
          if (validatedStep?.retryAfter && validatedStep.retryAfter.getTime() > Date.now()) {
            throw new TooEarlyError(`Cannot start step "${data.correlationId}": retryAfter timestamp has not been reached yet`, {
              retryAfter: Math.ceil((validatedStep.retryAfter.getTime() - Date.now()) / 1000),
            });
          }
          const [stepValue] = await tx
            .update(Schema.steps)
            .set({
              status: 'running',
              attempt: sql`${Schema.steps.attempt} + 1`,
              startedAt: sql`COALESCE(${Schema.steps.startedAt}, ${now.getTime()})`,
              retryAfter: null,
              updatedAt: now,
            })
            .where(
              and(
                eq(Schema.steps.runId, effectiveRunId),
                eq(Schema.steps.stepId, data.correlationId),
                notInArray(Schema.steps.status, terminalStepStatuses)
              )
            )
            .returning();
          if (stepValue) {
            step = parseStepRow(stepValue);
          } else {
            const [existing] = await tx
              .select({ status: Schema.steps.status })
              .from(Schema.steps)
              .where(and(eq(Schema.steps.runId, effectiveRunId), eq(Schema.steps.stepId, data.correlationId)))
              .limit(1);
            if (!existing) throw new WorkflowWorldError(`Step "${data.correlationId}" not found`);
            if (isTerminalStepStatus(existing.status)) {
              throw new EntityConflictError(`Cannot modify step in terminal state "${existing.status}"`);
            }
          }
          const eventValue = await insertEventRow(tx, {
            runId: effectiveRunId,
            eventId: await allocateEventId(tx, effectiveRunId),
            correlationId: data.correlationId,
            eventType: data.eventType,
            eventData: storedEventData as any,
            specVersion: effectiveSpecVersion,
          });
          if (!eventValue) throw new EntityConflictError(`Event for step "${data.correlationId}" could not be created`);
          eventId = eventValue.eventId;
          return { createdAt: eventValue.createdAt };
        });
      }

      const guardedStepUpdate = async (set: Partial<typeof Schema.steps.$inferInsert>) => {
        const [stepValue] = await drizzle
          .update(Schema.steps)
          .set({ ...set, updatedAt: now })
          .where(
            and(
              eq(Schema.steps.runId, effectiveRunId),
              eq(Schema.steps.stepId, data.correlationId),
              notInArray(Schema.steps.status, terminalStepStatuses)
            )
          )
          .returning();
        if (stepValue) {
          step = parseStepRow(stepValue);
          return;
        }
        const [existing] = await getStepForValidation(drizzle, effectiveRunId, data.correlationId);
        if (!existing) throw new WorkflowWorldError(`Step "${data.correlationId}" not found`);
        if (isTerminalStepStatus(existing.status)) {
          throw new EntityConflictError(`Cannot modify step in terminal state "${existing.status}"`);
        }
      };
      if (data.eventType === 'step_completed') await guardedStepUpdate({ status: 'completed', output: data.eventData.result, completedAt: now });
      if (data.eventType === 'step_failed') await guardedStepUpdate({ status: 'failed', error: data.eventData.error, completedAt: now });
      if (data.eventType === 'step_retrying') {
        await guardedStepUpdate({ status: 'pending', error: data.eventData.error, retryAfter: data.eventData.retryAfter });
      }

      if (data.eventType === 'hook_created') {
        const { eventData } = data;
        const [existingHook] = await getHookByToken(eventData.token);
        if (existingHook) {
          if (existingHook.runId === effectiveRunId && existingHook.hookId === data.correlationId) {
            const [existingEvent] = await getCorrelatedEvent(drizzle, effectiveRunId, data.correlationId, 'hook_created');
            if (existingEvent) throw new EntityConflictError(`Hook "${data.correlationId}" already created`);
            // Fila huérfana (hook sin evento): se completa el evento abajo.
            const [recovered] = await drizzle.select().from(Schema.hooks).where(eq(Schema.hooks.hookId, data.correlationId)).limit(1);
            if (recovered) hook = parseHookRow(recovered);
          } else {
            // Otro run tiene el token: se registra hook_conflict en lugar de 409.
            const conflictEventData = { token: eventData.token, conflictingRunId: existingHook.runId };
            const conflictValue = await insertEventRow(drizzle, {
              runId: effectiveRunId,
              eventId: await getEventId(),
              correlationId: data.correlationId,
              eventType: 'hook_conflict',
              eventData: conflictEventData as any,
              specVersion: effectiveSpecVersion,
            });
            if (!conflictValue) throw new EntityConflictError(`hook_conflict for run "${effectiveRunId}" could not be created`);
            const parsedConflict = EventSchema.parse({
              eventType: 'hook_conflict',
              correlationId: data.correlationId,
              eventData: conflictEventData,
              ...conflictValue,
              runId: effectiveRunId,
            });
            return { event: stripEventDataRefs(parsedConflict, params?.resolveData ?? 'all'), run, step, hook: undefined };
          }
        } else {
          await drizzle
            .delete(Schema.hooks)
            .where(and(eq(Schema.hooks.token, eventData.token), exists(ownerRunIsTerminal), hookRetentionEnded()));
          const [hookValue] = await drizzle
            .insert(Schema.hooks)
            .values({
              runId: effectiveRunId,
              hookId: data.correlationId,
              token: eventData.token,
              metadata: eventData.metadata,
              ownerId: '',
              projectId: '',
              environment: '',
              tokenRetentionUntil: eventData.tokenRetentionUntil,
              specVersion: effectiveSpecVersion,
              isWebhook: eventData.isWebhook,
              isSystem: eventData.isSystem ?? false,
            })
            .onConflictDoNothing()
            .returning();
          if (hookValue) hook = parseHookRow(hookValue);
        }
      }

      if (data.eventType === 'hook_disposed' && data.correlationId) {
        const disposedHookId = data.correlationId;
        value = await drizzle.transaction(async (tx) => {
          const [deleted] = await tx.delete(Schema.hooks).where(eq(Schema.hooks.hookId, disposedHookId)).returning({ hookId: Schema.hooks.hookId });
          if (!deleted) throw new EntityConflictError(`Hook "${disposedHookId}" already disposed`);
          const eventValue = await insertEventRow(tx, {
            runId: effectiveRunId,
            eventId: await getEventId(tx),
            correlationId: disposedHookId,
            eventType: data.eventType,
            eventData: storedEventData as any,
            specVersion: effectiveSpecVersion,
          });
          if (!eventValue) throw new EntityConflictError(`Event for hook "${disposedHookId}" could not be created`);
          eventId = eventValue.eventId;
          return { createdAt: eventValue.createdAt };
        });
      }

      if (data.eventType === 'hook_received') {
        // La transacción de escritura serializa contra cualquier transición terminal
        // y contra hook_disposed (escritor único en SQLite).
        value = await drizzle.transaction(async (tx) => {
          const [runRow] = await tx.select({ status: Schema.runs.status }).from(Schema.runs).where(eq(Schema.runs.runId, effectiveRunId)).limit(1);
          if (!runRow) throw new WorkflowRunNotFoundError(effectiveRunId);
          if (isTerminalWorkflowRunStatus(runRow.status)) {
            throw new RunExpiredError(`Workflow run "${effectiveRunId}" is already in terminal state "${runRow.status}"`);
          }
          if (data.correlationId) {
            const [liveHook] = await tx.select({ hookId: Schema.hooks.hookId }).from(Schema.hooks).where(eq(Schema.hooks.hookId, data.correlationId)).limit(1);
            if (!liveHook) throw new HookNotFoundError(data.correlationId);
          }
          const eventValue = await insertEventRow(tx, {
            runId: effectiveRunId,
            eventId: await allocateEventId(tx, effectiveRunId),
            correlationId: data.correlationId,
            eventType: data.eventType,
            eventData: storedEventData as any,
            specVersion: effectiveSpecVersion,
          });
          if (!eventValue) throw new EntityConflictError(`Event for hook "${data.correlationId}" could not be created`);
          eventId = eventValue.eventId;
          return { createdAt: eventValue.createdAt };
        });
      }

      const toWait = (w: typeof Schema.waits.$inferSelect): Wait => ({
        waitId: w.waitId,
        runId: w.runId,
        status: w.status,
        resumeAt: w.resumeAt ?? undefined,
        completedAt: w.completedAt ?? undefined,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
        specVersion: w.specVersion ?? undefined,
      });
      if (data.eventType === 'wait_created') {
        const waitId = `${effectiveRunId}-${data.correlationId}`;
        const [waitValue] = await drizzle
          .insert(Schema.waits)
          .values({ waitId, runId: effectiveRunId, status: 'waiting', resumeAt: data.eventData.resumeAt, specVersion: effectiveSpecVersion })
          .onConflictDoNothing()
          .returning();
        if (!waitValue) throw new EntityConflictError(`Wait "${data.correlationId}" already exists`);
        wait = toWait(waitValue);
      }
      if (data.eventType === 'wait_completed') {
        const waitId = `${effectiveRunId}-${data.correlationId}`;
        const [waitValue] = await drizzle
          .update(Schema.waits)
          .set({ status: 'completed', completedAt: now, updatedAt: now })
          .where(and(eq(Schema.waits.waitId, waitId), eq(Schema.waits.status, 'waiting')))
          .returning();
        if (waitValue) {
          wait = toWait(waitValue);
        } else {
          const [existing] = await drizzle.select({ status: Schema.waits.status }).from(Schema.waits).where(eq(Schema.waits.waitId, waitId)).limit(1);
          if (!existing) throw new WorkflowWorldError(`Wait "${data.correlationId}" not found`);
          if (existing.status === 'completed') throw new EntityConflictError(`Wait "${data.correlationId}" already completed`);
        }
      }

      // ---------- EVENTO ----------
      try {
        if (!value) {
          let inserted: { eventId: string; createdAt: Date } | undefined;
          if (data.eventType === 'step_created') {
            const eventData = data.eventData;
            const created = await drizzle.transaction(async (tx) => {
              let [stepValue] = await tx
                .insert(Schema.steps)
                .values({
                  runId: effectiveRunId,
                  stepId: data.correlationId,
                  stepName: eventData.stepName,
                  input: eventData.input,
                  status: 'pending',
                  attempt: 0,
                  specVersion: effectiveSpecVersion,
                })
                .onConflictDoNothing()
                .returning();
              if (!stepValue) {
                const [existingEvent] = await getCorrelatedEvent(tx, effectiveRunId, data.correlationId, 'step_created');
                if (existingEvent) {
                  throw new EntityConflictError(`step_created for correlationId "${data.correlationId}" already exists in run "${effectiveRunId}"`);
                }
                [stepValue] = await tx
                  .select()
                  .from(Schema.steps)
                  .where(and(eq(Schema.steps.runId, effectiveRunId), eq(Schema.steps.stepId, data.correlationId)))
                  .limit(1);
                if (!stepValue) {
                  throw new EntityConflictError(`step_created for correlationId "${data.correlationId}" already exists in run "${effectiveRunId}"`);
                }
              }
              const eventValue = await insertEventRow(tx, {
                runId: effectiveRunId,
                eventId: await getEventId(tx),
                correlationId: data.correlationId,
                eventType: data.eventType,
                eventData: storedEventData as any,
                specVersion: effectiveSpecVersion,
              });
              if (!eventValue) throw new EntityConflictError(`step_created for run "${effectiveRunId}" could not be created`);
              return { eventValue, stepValue };
            });
            step = parseStepRow(created.stepValue);
            inserted = created.eventValue;
          } else {
            inserted = await insertEventRow(drizzle, {
              runId: effectiveRunId,
              eventId: await getEventId(),
              correlationId: data.correlationId,
              eventType: data.eventType,
              eventData: storedEventData as any,
              specVersion: effectiveSpecVersion,
            });
          }
          if (inserted) {
            eventId = inserted.eventId;
            value = { createdAt: inserted.createdAt };
          }
        }
      } catch (err) {
        // UNIQUE en workflow_events_entity_creation_unique → EntityConflictError (dedup del runtime).
        const isDeduplicatedCorrelatedEvent =
          isChildEntityCreationEventType(data.eventType) || (data.eventType === 'attr_set' && data.eventData.writer.type === 'workflow');
        if (isDeduplicatedCorrelatedEvent && isUniqueViolation(err, ...ENTITY_CREATION_UNIQUE_COLUMNS)) {
          throw new EntityConflictError(`${data.eventType} for correlationId "${data.correlationId}" already exists in run "${effectiveRunId}"`);
        }
        throw err;
      }

      if (!value || !eventId) throw new EntityConflictError(`${data.eventType} for run "${effectiveRunId}" could not be created`);

      const result: Record<string, unknown> = {
        ...data,
        ...value,
        runId: effectiveRunId,
        eventId,
        ...(storedEventData !== undefined ? { eventData: storedEventData } : {}),
      };
      if (data.eventType === 'run_started') delete result.eventData;
      const parsed = EventSchema.parse(result);
      const resolveData = params?.resolveData ?? 'all';

      let eventPage: { data: Event[]; cursor: string | null; hasMore: boolean } | undefined;
      if (params?.eventCount !== undefined && typeof params.sinceCursor !== 'string') {
        const report = await reportSkippedSlots(drizzle, effectiveRunId, parsed.eventId, params.eventCount, resolveData);
        if (report) eventPage = { data: report.events, cursor: null, hasMore: report.hasMore };
      }
      if (data.eventType === 'run_started' && run && !params?.skipPreload) {
        const rows = await drizzle.select().from(events).where(eq(events.runId, effectiveRunId)).orderBy(events.eventId);
        const page = rows.map((e) => parseEventRow(e, resolveData));
        eventPage = { data: page, cursor: page.at(-1)?.eventId ?? null, hasMore: false };
      }
      if (typeof params?.sinceCursor === 'string') {
        const limit = 100;
        const deltaRows = await drizzle
          .select()
          .from(events)
          .where(and(eq(events.runId, effectiveRunId), gt(events.eventId, params.sinceCursor)))
          .orderBy(events.eventId)
          .limit(limit + 1);
        const page = deltaRows.slice(0, limit).map((e) => parseEventRow(e, resolveData));
        eventPage = { data: page, cursor: page.at(-1)?.eventId ?? null, hasMore: deltaRows.length > limit };
      }

      if (run && isTerminalWorkflowRunStatus(run.status)) {
        await purgeRunUserDataIfZeroRetention(drizzle, effectiveRunId, run.attributes, now);
        runStatus?.notify(effectiveRunId);
      }

      const eventResult = {
        event: stripEventDataRefs(parsed, resolveData),
        run,
        step,
        hook,
        wait,
        ...(stepCreatedLazily ? { stepCreated: true as const } : {}),
      };
      if (!eventPage) return eventResult;
      return { ...eventResult, events: eventPage.data, cursor: eventPage.cursor, hasMore: eventPage.hasMore };
    },

    async get(runId, eventId, params) {
      const [value] = await drizzle.select().from(events).where(and(eq(events.runId, runId), eq(events.eventId, eventId))).limit(1);
      if (!value) throw new WorkflowWorldError(`Event not found: ${eventId}`);
      return parseEventRow(value, params?.resolveData ?? 'all');
    },

    async list(params: ListEventsParams): Promise<PaginatedResponse<Event>> {
      const limit = params.pagination?.limit ?? getMaxEventsPerRun();
      const sortOrder = params.pagination?.sortOrder ?? 'asc';
      const order = sortOrder === 'desc' ? { by: desc(events.eventId), compare: lt } : { by: asc(events.eventId), compare: gt };
      const resolveData = params.resolveData ?? 'all';
      const data: Event[] = [];
      let cursor = params.pagination?.cursor;
      let hasMore = false;
      do {
        const pageLimit = params.pagination?.limit === undefined ? Math.min(500, limit - data.length) : limit;
        const rows = await drizzle
          .select()
          .from(events)
          .where(and(eq(events.runId, params.runId), map(cursor, (v) => order.compare(events.eventId, v))))
          .orderBy(order.by)
          .limit(pageLimit + 1);
        const page = rows.slice(0, pageLimit);
        for (const row of page) data.push(parseEventRow(row, resolveData));
        cursor = page.at(-1)?.eventId;
        hasMore = rows.length > pageLimit;
      } while (params.pagination?.limit === undefined && hasMore && data.length < limit);
      return { data, cursor: data.at(-1)?.eventId ?? null, hasMore };
    },

    async listByCorrelationId(params: ListEventsByCorrelationIdParams): Promise<PaginatedResponse<Event>> {
      const limit = params?.pagination?.limit ?? 100;
      const sortOrder = params.pagination?.sortOrder || 'asc';
      const order = sortOrder === 'desc' ? { by: desc(events.eventId), compare: lt } : { by: asc(events.eventId), compare: gt };
      const all = await drizzle
        .select()
        .from(events)
        .where(
          and(
            eq(events.correlationId, params.correlationId),
            eq(events.runId, params.runId),
            map(params.pagination?.cursor, (c) => order.compare(events.eventId, c))
          )
        )
        .orderBy(order.by)
        .limit(limit + 1);
      const values = all.slice(0, limit);
      const resolveData = params?.resolveData ?? 'all';
      return {
        data: values.map((v) => parseEventRow(v, resolveData)),
        cursor: values.at(-1)?.eventId ?? null,
        hasMore: all.length > limit,
      };
    },
  };
}

export function createHooksStorage(drizzle: Drizzle): Storage['hooks'] {
  const { hooks, runs } = Schema;
  const ownerRunIsTerminal = drizzle
    .select({ runId: runs.runId })
    .from(runs)
    .where(and(eq(runs.runId, hooks.runId), inArray(runs.status, TERMINAL_WORKFLOW_RUN_STATUSES)));
  const available = () => or(gt(hooks.tokenRetentionUntil, new Date()), notExists(ownerRunIsTerminal));
  return {
    async get(hookId: string, params?: GetHookParams) {
      const [value] = await drizzle.select().from(hooks).where(and(eq(hooks.hookId, hookId), available())).limit(1);
      if (!value) throw new HookNotFoundError(hookId);
      return filterHookData(parseHookRow(value), params?.resolveData ?? 'all');
    },
    async getByToken(token: string, params?: GetHookParams) {
      const [value] = await drizzle.select().from(hooks).where(and(eq(hooks.token, token), available())).limit(1);
      if (!value) throw new HookNotFoundError(token);
      return filterHookData(parseHookRow(value), params?.resolveData ?? 'all');
    },
    async list(params: ListHooksParams) {
      const limit = params?.pagination?.limit ?? 100;
      const fromCursor = params?.pagination?.cursor;
      const sortOrder = params?.pagination?.sortOrder ?? 'asc';
      const orderFn = sortOrder === 'asc' ? asc : desc;
      const cursorFn = sortOrder === 'asc' ? gt : lt;
      const all = await drizzle
        .select()
        .from(hooks)
        .where(and(available(), map(params.runId, (id) => eq(hooks.runId, id)), map(fromCursor, (c) => cursorFn(hooks.hookId, c))))
        .orderBy(orderFn(hooks.hookId))
        .limit(limit + 1);
      const values = all.slice(0, limit);
      const resolveData = params?.resolveData ?? 'all';
      return {
        data: values.map((v) => filterHookData(parseHookRow(v), resolveData)),
        cursor: values.at(-1)?.hookId ?? null,
        hasMore: all.length > limit,
      };
    },
  };
}

export function createStepsStorage(drizzle: Drizzle): Storage['steps'] {
  const { steps } = Schema;
  return {
    get: (async (runId: string, stepId: string, params?: GetStepParams) => {
      const [value] = await drizzle.select().from(steps).where(and(eq(steps.runId, runId), eq(steps.stepId, stepId))).limit(1);
      if (!value) throw new WorkflowWorldError(`Step not found: ${stepId}`);
      return filterStepData(parseStepRow(value), params?.resolveData ?? 'all');
    }) as Storage['steps']['get'],
    list: (async (params: ListWorkflowRunStepsParams) => {
      const limit = params?.pagination?.limit ?? 20;
      const fromCursor = params?.pagination?.cursor;
      const all = await drizzle
        .select()
        .from(steps)
        .where(and(eq(steps.runId, params.runId), map(fromCursor, (c) => lt(steps.stepId, c))))
        .orderBy(desc(steps.stepId))
        .limit(limit + 1);
      const values = all.slice(0, limit);
      const resolveData = params?.resolveData ?? 'all';
      return {
        data: values.map((v) => filterStepData(parseStepRow(v), resolveData)),
        hasMore: all.length > limit,
        cursor: values.at(-1)?.stepId ?? null,
      };
    }) as Storage['steps']['list'],
  };
}
