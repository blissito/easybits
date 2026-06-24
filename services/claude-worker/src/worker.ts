// Session store + turn runner. One conversation = one sessionId (UUID from the
// Pool) = one persistent transcript .jsonl under /data. A turn spawns the Agent
// SDK (its own claude subprocess) with --resume on that conversation's continuation.
//
// "One worker per sessionId" is honored two ways:
//   - each sessionId gets its own cwd (/data/workspaces/<uuid>) and continuation;
//   - a per-sessionId lock serializes turns so two POSTs for the same conversation
//     never race the same .jsonl. Different sessionIds run fully concurrently
//     (each its own claude subprocess), bounded by VM vCPU.
import fs from 'fs';
import path from 'path';

import { ClaudeProvider } from './provider.js';
import type { McpServerConfig, ProviderEvent, ProviderOptions } from './types.js';

const DATA_DIR = process.env.CLAUDE_WORKER_DATA_DIR || '/data';
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const WORKSPACES_DIR = path.join(DATA_DIR, 'workspaces');

// uuid (Pool sessionId) → SDK session id (resume handle). Persisted to /data so
// it survives suspend/resume.
type SessionMap = Record<string, string>;

function loadSessions(): SessionMap {
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveContinuation(sessionId: string, continuation: string): void {
  const map = loadSessions();
  if (map[sessionId] === continuation) return;
  map[sessionId] = continuation;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(map, null, 2));
}

function clearContinuation(sessionId: string): void {
  const map = loadSessions();
  if (!(sessionId in map)) return;
  delete map[sessionId];
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(map, null, 2));
}

function workspaceFor(sessionId: string): string {
  // sessionId is a UUID from the Pool; keep the dir name filesystem-safe.
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
  const cwd = path.join(WORKSPACES_DIR, safe);
  fs.mkdirSync(cwd, { recursive: true });
  return cwd;
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

function buildProvider(cfg: WorkerConfig): ClaudeProvider {
  const opts: ProviderOptions = {
    assistantName: cfg.assistantName,
    mcpServers: cfg.mcpServers,
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
): AsyncGenerator<ProviderEvent> {
  const events = await withLock(sessionId, async () => collectTurn(cfg, sessionId, content, false));
  for (const ev of events) yield ev;
}

// Collect a turn's events into an array under the lock (so the lock covers the
// whole SDK run, not just its setup). The caller re-emits them as SSE.
async function collectTurn(
  cfg: WorkerConfig,
  sessionId: string,
  content: string,
  isRetry: boolean,
): Promise<ProviderEvent[]> {
  const cwd = workspaceFor(sessionId);
  const continuation = loadSessions()[sessionId];
  const provider = buildProvider(cfg);
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
      return collectTurn(cfg, sessionId, content, true);
    }
    out.push({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      retryable: false,
    });
  }
  return out;
}
