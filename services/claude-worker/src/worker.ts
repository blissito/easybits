// Session store + turn runner. One conversation = one sessionId (UUID from the
// Pool) = one persistent transcript .jsonl under /data. A turn spawns the Agent
// SDK (its own claude subprocess) with --resume on that conversation's continuation.
//
// "One worker per sessionId" is honored two ways:
//   - each sessionId gets its own cwd (/data/workspaces/<uuid>) and continuation;
//   - a per-sessionId lock serializes turns so two POSTs for the same conversation
//     never race the same .jsonl. Different sessionIds run fully concurrently
//     (each its own claude subprocess), bounded by VM vCPU.
//
// SELF-CONTAINED MEMORY: the resume continuation is persisted PER WORKSPACE
// (/data/workspaces/<uuid>/continuation) rather than in a shared sessions.json.
// That keeps everything a conversation needs to resume under its own dir, so the
// Pool can tar a single conversation's memory to durable storage and restore it
// onto a fresh VM (see poolOperations.backupConversation). The SDK .jsonl
// transcript still lives at /data/.claude/projects/-data-workspaces-<uuid>/ — a
// deterministic path the Pool backs up alongside the workspace.
import fs from 'fs';
import path from 'path';

import { ClaudeProvider } from './provider.js';
import type { McpServerConfig, ProviderEvent, ProviderOptions } from './types.js';

const DATA_DIR = process.env.CLAUDE_WORKER_DATA_DIR || '/data';
const WORKSPACES_DIR = path.join(DATA_DIR, 'workspaces');

function workspaceFor(sessionId: string): string {
  // sessionId is a UUID from the Pool; keep the dir name filesystem-safe.
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
  const cwd = path.join(WORKSPACES_DIR, safe);
  fs.mkdirSync(cwd, { recursive: true });
  return cwd;
}

// SDK session id (resume handle) persisted inside the conversation's workspace.
function continuationFile(sessionId: string): string {
  return path.join(workspaceFor(sessionId), 'continuation');
}

function loadContinuation(sessionId: string): string | undefined {
  try {
    return fs.readFileSync(continuationFile(sessionId), 'utf-8').trim() || undefined;
  } catch {
    return undefined;
  }
}

function saveContinuation(sessionId: string, continuation: string): void {
  if (loadContinuation(sessionId) === continuation) return;
  fs.writeFileSync(continuationFile(sessionId), continuation);
}

function clearContinuation(sessionId: string): void {
  try {
    fs.rmSync(continuationFile(sessionId));
  } catch {
    /* already gone */
  }
}

// Per-sessionId serialization. Map<sessionId, tail-of-promise-chain>.
const locks = new Map<string, Promise<unknown>>();

function withLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(sessionId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  // Swallow rejections so the next waiter isn't poisoned.
  const tail = next.catch(() => undefined);
  locks.set(sessionId, tail);
  // Drop the entry once this is the last turn for the session — keeps the map
  // from growing one permanent entry per conversation over the worker's life.
  tail.then(() => {
    if (locks.get(sessionId) === tail) locks.delete(sessionId);
  });
  return next;
}

export interface WorkerConfig {
  assistantName?: string;
  systemPrompt?: string;
  mcpServers?: Record<string, McpServerConfig>;
  /** Env passed down to the claude subprocess (OAuth token lives here). */
  childEnv: Record<string, string | undefined>;
}

// denik MCP server config for a given key. Shared by the VM-level builder
// (server.ts) and the per-message override below.
export function denikServerConfig(denikApiKey: string): McpServerConfig {
  return {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@denik.me/mcp'],
    env: {
      DENIK_API_KEY: denikApiKey,
      DENIK_BASE_URL: process.env.DENIK_BASE_URL ?? '',
    },
  };
}

// `denikApiKey` (per-message) scopes the denik MCP to ONE org for THIS turn only
// — built fresh per turn (buildProvider runs per turn), so co-located
// conversations on the same VM each see only their own org. Overrides any
// VM-level denik server; when absent, no denik MCP this turn (no cross-org leak).
function buildProvider(cfg: WorkerConfig, denikApiKey?: string): ClaudeProvider {
  const mcpServers = denikApiKey
    ? { ...cfg.mcpServers, denik: denikServerConfig(denikApiKey) }
    : cfg.mcpServers;
  const opts: ProviderOptions = {
    assistantName: cfg.assistantName,
    mcpServers,
    env: cfg.childEnv,
  };
  return new ClaudeProvider(opts);
}

/**
 * Run one turn for a conversation and yield provider events. Serialized per
 * sessionId. Clears + retries once if the stored continuation is stale.
 */
export async function* runTurn(
  cfg: WorkerConfig,
  sessionId: string,
  content: string,
  denikApiKey?: string,
): AsyncGenerator<ProviderEvent> {
  const events = await withLock(sessionId, async () => collectTurn(cfg, sessionId, content, false, denikApiKey));
  for (const ev of events) yield ev;
}

// Collect a turn's events into an array under the lock (so the lock covers the
// whole SDK run, not just its setup). The caller re-emits them as SSE.
async function collectTurn(
  cfg: WorkerConfig,
  sessionId: string,
  content: string,
  isRetry: boolean,
  denikApiKey?: string,
): Promise<ProviderEvent[]> {
  const cwd = workspaceFor(sessionId);
  const continuation = loadContinuation(sessionId);
  const provider = buildProvider(cfg, denikApiKey);
  const out: ProviderEvent[] = [];

  const q = provider.query({
    prompt: content,
    continuation,
    cwd,
    systemContext: cfg.systemPrompt ? { instructions: cfg.systemPrompt } : undefined,
  });

  try {
    for await (const ev of q.events) {
      if (ev.type === 'init') {
        saveContinuation(sessionId, ev.continuation);
      }
      out.push(ev);
    }
  } catch (err) {
    if (!isRetry && continuation && provider.isSessionInvalid(err)) {
      // Stale transcript — drop the handle and start fresh once.
      clearContinuation(sessionId);
      return collectTurn(cfg, sessionId, content, true, denikApiKey);
    }
    out.push({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      retryable: false,
    });
  }
  return out;
}
