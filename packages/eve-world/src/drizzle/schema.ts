import type { Event, EventType, Hook, Step, WorkflowRun } from '@workflow/world';
import { sql } from 'drizzle-orm';
import {
  blob,
  customType,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { Cbor } from './cbor.js';

// Mismas tablas que world-postgres, en dialecto SQLite:
// - timestamps como epoch ms (integer, mode timestamp_ms)
// - enums como text
// - CBOR/bytea como blob
// - attributes (jsonb) como text JSON, se mezcla en JS dentro de una transacción

const ts = (name: string) => integer(name, { mode: 'timestamp_ms' });

const jsonText = <T>() =>
  customType<{ data: T; driverData: string }>({
    dataType: () => 'text',
    fromDriver: (value): T => JSON.parse(value) as T,
    toDriver: (value): string => JSON.stringify(value),
  });

export const runs = sqliteTable(
  'workflow_runs',
  {
    runId: text('id').primaryKey(),
    output: Cbor<WorkflowRun['output']>()('output_cbor'),
    deploymentId: text('deployment_id').notNull(),
    status: text('status').$type<WorkflowRun['status']>().notNull(),
    workflowName: text('name').notNull(),
    specVersion: integer('spec_version'),
    executionContext: Cbor<WorkflowRun['executionContext']>()('execution_context_cbor'),
    input: Cbor<WorkflowRun['input']>()('input_cbor'),
    error: Cbor<WorkflowRun['error']>()('error_cbor'),
    errorCode: text('error_code'),
    attributes: jsonText<Record<string, string>>()('attributes').default({}).notNull(),
    encryptionPublicKey: text('encryption_public_key'),
    createdAt: ts('created_at').notNull().$defaultFn(() => new Date()),
    updatedAt: ts('updated_at')
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    completedAt: ts('completed_at'),
    startedAt: ts('started_at'),
    expiredAt: ts('expired_at'),
  },
  (tb) => [index('workflow_runs_name_idx').on(tb.workflowName), index('workflow_runs_status_idx').on(tb.status)]
);

export const events = sqliteTable(
  'workflow_events',
  {
    eventId: text('id').notNull(),
    eventType: text('type').$type<EventType>().notNull(),
    correlationId: text('correlation_id'),
    createdAt: ts('created_at').notNull().$defaultFn(() => new Date()),
    runId: text('run_id').notNull(),
    eventData: Cbor<Event['eventData']>()('payload_cbor'),
    specVersion: integer('spec_version'),
  },
  (tb) => [
    // Los ids de evento son posiciones por run: sólo son únicos junto al run.
    primaryKey({ columns: [tb.runId, tb.eventId] }),
    index('workflow_events_correlation_idx').on(tb.correlationId),
    // Un evento de creación de entidad por (run, correlación): dos invocaciones
    // concurrentes con el mismo correlationId no pueden duplicarlo.
    uniqueIndex('workflow_events_entity_creation_unique')
      .on(tb.runId, tb.correlationId, tb.eventType)
      .where(sql`${tb.eventType} IN ('step_created', 'hook_created', 'wait_created', 'attr_set')`),
  ]
);

// Marcador: existe una fila si y sólo si el run numera sus eventos por slot.
export const eventSlots = sqliteTable('workflow_event_slots', {
  runId: text('run_id').primaryKey(),
});

export const steps = sqliteTable(
  'workflow_steps',
  {
    runId: text('run_id').notNull(),
    stepId: text('step_id').primaryKey(),
    stepName: text('step_name').notNull(),
    status: text('status').$type<Step['status']>().notNull(),
    input: Cbor<Step['input']>()('input_cbor'),
    output: Cbor<Step['output']>()('output_cbor'),
    error: Cbor<Step['error']>()('error_cbor'),
    attempt: integer('attempt').notNull(),
    startedAt: ts('started_at'),
    completedAt: ts('completed_at'),
    createdAt: ts('created_at').notNull().$defaultFn(() => new Date()),
    updatedAt: ts('updated_at')
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    retryAfter: ts('retry_after'),
    specVersion: integer('spec_version'),
  },
  (tb) => [index('workflow_steps_run_idx').on(tb.runId), index('workflow_steps_status_idx').on(tb.status)]
);

export const hooks = sqliteTable(
  'workflow_hooks',
  {
    runId: text('run_id').notNull(),
    hookId: text('hook_id').primaryKey(),
    token: text('token').notNull(),
    ownerId: text('owner_id').notNull(),
    projectId: text('project_id').notNull(),
    environment: text('environment').notNull(),
    createdAt: ts('created_at').notNull().$defaultFn(() => new Date()),
    tokenRetentionUntil: ts('token_retention_until'),
    metadata: Cbor<Hook['metadata']>()('metadata_cbor'),
    specVersion: integer('spec_version'),
    isWebhook: integer('is_webhook', { mode: 'boolean' }).default(true),
    isSystem: integer('is_system', { mode: 'boolean' }).default(false),
    resumeContext: Cbor<unknown>()('resume_context'),
  },
  (tb) => [index('workflow_hooks_run_idx').on(tb.runId), index('workflow_hooks_token_idx').on(tb.token)]
);

export const waits = sqliteTable(
  'workflow_waits',
  {
    waitId: text('wait_id').primaryKey(),
    runId: text('run_id').notNull(),
    status: text('status').$type<'waiting' | 'completed'>().notNull(),
    resumeAt: ts('resume_at'),
    completedAt: ts('completed_at'),
    createdAt: ts('created_at').notNull().$defaultFn(() => new Date()),
    updatedAt: ts('updated_at')
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    specVersion: integer('spec_version'),
  },
  (tb) => [index('workflow_waits_run_idx').on(tb.runId)]
);

export const streams = sqliteTable(
  'workflow_stream_chunks',
  {
    chunkId: text('id').notNull(),
    streamId: text('stream_id').notNull(),
    runId: text('run_id'),
    chunkData: blob('data', { mode: 'buffer' }).notNull(),
    createdAt: ts('created_at').notNull().$defaultFn(() => new Date()),
    eof: integer('eof', { mode: 'boolean' }).notNull(),
  },
  (tb) => [primaryKey({ columns: [tb.streamId, tb.chunkId] }), index('workflow_stream_chunks_run_idx').on(tb.runId)]
);

// Cola por polling: sustituye a graphile-worker/pg-boss.
// status: pending | processing | failed. Un mensaje procesado se borra (ack).
export const queue = sqliteTable(
  'workflow_queue',
  {
    messageId: text('message_id').primaryKey(),
    queueName: text('queue_name').notNull(),
    payload: blob('payload', { mode: 'buffer' }).notNull(),
    headers: jsonText<Record<string, string> | null>()('headers'),
    idempotencyKey: text('idempotency_key'),
    status: text('status').$type<'pending' | 'processing' | 'failed'>().notNull(),
    attempt: integer('attempt').notNull().default(0),
    notBefore: ts('not_before').notNull(),
    lockedUntil: ts('locked_until'),
    lockedBy: text('locked_by'),
    lastError: text('last_error'),
    createdAt: ts('created_at').notNull().$defaultFn(() => new Date()),
  },
  (tb) => [
    index('workflow_queue_ready_idx').on(tb.status, tb.notBefore),
    uniqueIndex('workflow_queue_idempotency_unique').on(tb.idempotencyKey),
  ]
);
