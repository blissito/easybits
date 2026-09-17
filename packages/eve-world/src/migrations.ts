import type { Client } from '@libsql/client';

// DDL idempotente; espejo exacto de drizzle/schema.ts. Sin drizzle-kit en runtime.
const DDL = [
  `CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY,
    output_cbor BLOB,
    deployment_id TEXT NOT NULL,
    status TEXT NOT NULL,
    name TEXT NOT NULL,
    spec_version INTEGER,
    execution_context_cbor BLOB,
    input_cbor BLOB,
    error_cbor BLOB,
    error_code TEXT,
    attributes TEXT NOT NULL DEFAULT '{}',
    encryption_public_key TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER,
    started_at INTEGER,
    expired_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS workflow_runs_name_idx ON workflow_runs (name)`,
  `CREATE INDEX IF NOT EXISTS workflow_runs_status_idx ON workflow_runs (status)`,
  `CREATE TABLE IF NOT EXISTS workflow_events (
    id TEXT NOT NULL,
    type TEXT NOT NULL,
    correlation_id TEXT,
    created_at INTEGER NOT NULL,
    run_id TEXT NOT NULL,
    payload_cbor BLOB,
    spec_version INTEGER,
    PRIMARY KEY (run_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS workflow_events_correlation_idx ON workflow_events (correlation_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS workflow_events_entity_creation_unique
     ON workflow_events (run_id, correlation_id, type)
     WHERE type IN ('step_created', 'hook_created', 'wait_created', 'attr_set')`,
  `CREATE TABLE IF NOT EXISTS workflow_event_slots (run_id TEXT PRIMARY KEY)`,
  `CREATE TABLE IF NOT EXISTS workflow_steps (
    run_id TEXT NOT NULL,
    step_id TEXT PRIMARY KEY,
    step_name TEXT NOT NULL,
    status TEXT NOT NULL,
    input_cbor BLOB,
    output_cbor BLOB,
    error_cbor BLOB,
    attempt INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    retry_after INTEGER,
    spec_version INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS workflow_steps_run_idx ON workflow_steps (run_id)`,
  `CREATE INDEX IF NOT EXISTS workflow_steps_status_idx ON workflow_steps (status)`,
  `CREATE TABLE IF NOT EXISTS workflow_hooks (
    run_id TEXT NOT NULL,
    hook_id TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    environment TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    token_retention_until INTEGER,
    metadata_cbor BLOB,
    spec_version INTEGER,
    is_webhook INTEGER DEFAULT 1,
    is_system INTEGER DEFAULT 0,
    resume_context BLOB
  )`,
  `CREATE INDEX IF NOT EXISTS workflow_hooks_run_idx ON workflow_hooks (run_id)`,
  `CREATE INDEX IF NOT EXISTS workflow_hooks_token_idx ON workflow_hooks (token)`,
  `CREATE TABLE IF NOT EXISTS workflow_waits (
    wait_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    status TEXT NOT NULL,
    resume_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    spec_version INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS workflow_waits_run_idx ON workflow_waits (run_id)`,
  `CREATE TABLE IF NOT EXISTS workflow_stream_chunks (
    id TEXT NOT NULL,
    stream_id TEXT NOT NULL,
    run_id TEXT,
    data BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    eof INTEGER NOT NULL,
    PRIMARY KEY (stream_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS workflow_stream_chunks_run_idx ON workflow_stream_chunks (run_id)`,
  `CREATE TABLE IF NOT EXISTS workflow_queue (
    message_id TEXT PRIMARY KEY,
    queue_name TEXT NOT NULL,
    payload BLOB NOT NULL,
    headers TEXT,
    idempotency_key TEXT,
    status TEXT NOT NULL,
    attempt INTEGER NOT NULL DEFAULT 0,
    not_before INTEGER NOT NULL,
    locked_until INTEGER,
    locked_by TEXT,
    last_error TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS workflow_queue_ready_idx ON workflow_queue (status, not_before)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS workflow_queue_idempotency_unique ON workflow_queue (idempotency_key)`,
];

let inflight = new WeakMap<Client, Promise<void>>();

/** Crea las tablas si no existen. Idempotente y memoizado por cliente. */
export function ensureSchema(client: Client): Promise<void> {
  let p = inflight.get(client);
  if (!p) {
    p = (async () => {
      for (const stmt of DDL) await client.execute(stmt);
    })().catch((err) => {
      inflight.delete(client);
      throw err;
    });
    inflight.set(client, p);
  }
  return p;
}

export function _resetSchemaCacheForTests() {
  inflight = new WeakMap();
}
