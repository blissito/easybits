import type { Client } from '@libsql/client';

export type LibsqlWorldConfig = {
  /** `file:…`, `libsql://…`, `http(s)://…`, `ws(s)://…`. Default: WORKFLOW_LIBSQL_URL / EASYBITS_DB_URL. */
  url?: string;
  /** JWT para sqld. Default: WORKFLOW_LIBSQL_AUTH_TOKEN / EASYBITS_DB_TOKEN. */
  authToken?: string;
  /** Cliente ya construido; si viene, `url`/`authToken` se ignoran y no se cierra en close(). */
  client?: Client;
  /** Base URL del servidor que hospeda los endpoints `/.well-known/workflow/v1/*`. Default: WORKFLOW_SERVICE_URL. */
  serviceUrl?: string;
  /** Mensajes en vuelo a la vez. Default: WORKFLOW_CONCURRENCY o 20. */
  queueConcurrency?: number;
  /** Intervalo del polling de la cola en ms. Default: WORKFLOW_QUEUE_POLL_MS o 250. */
  queuePollMs?: number;
  /** Duración del lease de un mensaje reclamado en ms. Default: WORKFLOW_QUEUE_LEASE_MS o 30000. */
  queueLeaseMs?: number;
  /** Namespace de la cola (prefijo de topics). Default: WORKFLOW_QUEUE_NAMESPACE. */
  namespace?: string;
  /** Deployment id que reporta getDeploymentId(). Default: WORKFLOW_DEPLOYMENT_ID o `dpl_libsql`. */
  deploymentId?: string;
  streamFlushIntervalMs?: number;
  /** Polling de lectores de stream en ms (sin LISTEN/NOTIFY en libSQL). Default: WORKFLOW_STREAM_POLL_MS o 250. */
  streamPollMs?: number;
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type ResolvedConfig = Required<
  Pick<LibsqlWorldConfig, 'queueConcurrency' | 'queuePollMs' | 'queueLeaseMs' | 'deploymentId' | 'streamPollMs'>
> &
  LibsqlWorldConfig;

export function resolveConfig(config: LibsqlWorldConfig = {}): ResolvedConfig {
  return {
    ...config,
    url: config.url ?? process.env.WORKFLOW_LIBSQL_URL ?? process.env.EASYBITS_DB_URL ?? 'file:workflow.db',
    authToken: config.authToken ?? process.env.WORKFLOW_LIBSQL_AUTH_TOKEN ?? process.env.EASYBITS_DB_TOKEN,
    serviceUrl: config.serviceUrl ?? process.env.WORKFLOW_SERVICE_URL,
    queueConcurrency: config.queueConcurrency ?? envInt('WORKFLOW_CONCURRENCY', 20),
    queuePollMs: config.queuePollMs ?? envInt('WORKFLOW_QUEUE_POLL_MS', 250),
    queueLeaseMs: config.queueLeaseMs ?? envInt('WORKFLOW_QUEUE_LEASE_MS', 30_000),
    namespace: config.namespace ?? process.env.WORKFLOW_QUEUE_NAMESPACE,
    deploymentId: config.deploymentId ?? process.env.WORKFLOW_DEPLOYMENT_ID ?? 'dpl_libsql',
    streamPollMs: config.streamPollMs ?? envInt('WORKFLOW_STREAM_POLL_MS', 250),
  };
}
