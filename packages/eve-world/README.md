# @easybits.cloud/eve-world

A [Workflow SDK](https://workflow-sdk.dev) **World** backed by libSQL / sqld (EasyBits DB).
It lets a hosted [eve](https://github.com/vercel/eve) server keep its runs, steps, events,
hooks, streams and delivery queue in a database instead of on the box's disk.

It is a port of `@workflow/world-postgres@5.0.0-beta.44` (Drizzle) to `@libsql/client` +
Drizzle SQLite, with graphile-worker replaced by a polling queue table with per-message
leases. Targets `@workflow/world@5.0.0-beta.35` (the line eve 0.58.1 pins).

## Install

```sh
npm i @easybits.cloud/eve-world
```

`@workflow/world@5.0.0-beta.35` is a peer dependency; eve already brings it.

## Use with eve

```ts
// agent.ts
export default {
  // ...
  experimental: {
    workflow: {
      world: '@easybits.cloud/eve-world',
    },
  },
};
```

The package exports a default factory and a named `createWorld(config?)`; either is accepted.
Tables are created on first use (`ensureSchema()`, idempotent). No migration CLI is needed.

## Configuration (env)

| Variable | Default | Meaning |
|---|---|---|
| `WORKFLOW_LIBSQL_URL` (alias `EASYBITS_DB_URL`) | `file:workflow.db` | `file:…`, `libsql://…`, `http(s)://…`, `ws(s)://…` |
| `WORKFLOW_LIBSQL_AUTH_TOKEN` (alias `EASYBITS_DB_TOKEN`) | – | JWT for sqld (scoped to one namespace) |
| `WORKFLOW_SERVICE_URL` | `http://localhost:$PORT` | Base URL where `/.well-known/workflow/v1/flow` is served; the queue POSTs deliveries there. Before its first claim the worker waits (up to 30 s) for `GET <base>/eve/v1/health` to answer 200, so a custom server should expose that route |
| `WORKFLOW_CONCURRENCY` | `20` | Messages in flight per process |
| `WORKFLOW_QUEUE_POLL_MS` | `250` | Queue polling interval |
| `WORKFLOW_QUEUE_LEASE_MS` | `30000` | Lease on a claimed message (renewed by heartbeat while the delivery runs) |
| `WORKFLOW_QUEUE_NAMESPACE` | – | Queue topic namespace |
| `WORKFLOW_DEPLOYMENT_ID` | `dpl_libsql` | Value returned by `getDeploymentId()` |
| `WORKFLOW_STREAM_POLL_MS` | `250` | Poll interval for live stream readers (cross-process) |
| `WORKFLOW_RUN_STATUS_POLL_INTERVAL_MS` | `1000` | Backstop re-read for `waitForTerminalStatus` |
| `WORKFLOW_HOOK_RETENTION_LIMIT_DAYS` | `30` | Max `experimental_minRetention` for hooks |

Programmatic: `createWorld({ url, authToken, client, serviceUrl, queueConcurrency, … })`.

## Capabilities

| Capability / method | Status |
|---|---|
| `specVersion` (`mintedSpecVersion()`), slot event ids, bump-and-report, `sinceCursor` delta, `run_started` preload | yes |
| `runs.get/list/getMany/waitForTerminalStatus/experimentalSetAttributes` | yes (`waitForTerminalStatus` wakes in-process, polls cross-process) |
| `steps.get/list`, `hooks.get/getByToken/list` | yes |
| `events.create` (all event types incl. lazy `step_started`, `hook_conflict`, `attr_set`, legacy runs), `get/list/listByCorrelationId` | yes |
| `events.createBatch` | no (runtime falls back to single `create`) |
| `capabilities.hookRetention` | `{ active: true }` |
| `capabilities.hookResumeDedup`, `maxConcurrency`, `deploymentAffinity` | unset (same as world-postgres) |
| `runs.cancelMany`, `analytics`, `getEncryptionKeyForRun`, `createRunId`, `getEnvironment`, `describeRun` | not implemented (all optional) |
| `streams.write/writeMulti/close/get/getChunks/getInfo/list` | yes |
| `queue`, `createQueueHandler`, `getDeploymentId`, `start`, `close` | yes; `queueBatch` not implemented |
| `$retention: 0` purge | yes |

## Queue semantics

Messages live in `workflow_queue`. A worker claims the oldest ready row with a single
`UPDATE … RETURNING` (atomic in SQLite/sqld), holding a lease (`locked_until`) that a
heartbeat renews while the HTTP delivery is in flight. A crashed worker's lease expires and
another worker redelivers with the **same** `messageId` and `attempt + 1`. `ack` deletes the
row; a `{ timeoutSeconds }` response reschedules it. Idempotency keys are unique: re-enqueuing
the same key returns the existing message id.

## Limits

- Multi-process: works against one sqld namespace, but wake-ups are in-process only; cross-process
  readers rely on polling (`WORKFLOW_STREAM_POLL_MS`, `WORKFLOW_RUN_STATUS_POLL_INTERVAL_MS`).
- SQLite is single-writer; throughput is bounded by write serialization on the namespace.
- No `LISTEN/NOTIFY`, no `FOR UPDATE`; ordering guarantees come from `BEGIN IMMEDIATE` transactions.
- Payloads are stored as CBOR blobs; attributes as JSON text (merged in JS inside a transaction).

## Development

```sh
npm test                                                   # vitest against a file: DB
WORKFLOW_LIBSQL_URL=file:/tmp/w.db npm run smoke           # smoke without eve
WORKFLOW_LIBSQL_URL=libsql://host:8100 WORKFLOW_LIBSQL_AUTH_TOKEN=… npm run smoke
```
