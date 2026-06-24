// claude-worker dispatcher. HTTP :3000, POST /message {content, sessionId} → SSE.
// Routes each sessionId to its own Agent SDK session (resume on /data). See
// docs/claude-worker-contract.md.
import http from 'http';

import { runTurn, type WorkerConfig } from './worker.js';
import { startFallbackProxy } from './proxy.js';
import type { McpServerConfig } from './types.js';

const PORT = Number(process.env.PORT || 3000);
const MESSAGE_PATH = process.env.MESSAGE_PATH || '/message';
// HOME drives where the Agent SDK writes ~/.claude/projects/<...>.jsonl transcripts.
// Point it at the persistent volume so resume survives suspend/resume.
const WORKER_HOME = process.env.CLAUDE_WORKER_HOME || process.env.CLAUDE_WORKER_DATA_DIR || '/data';
const PROXY_PORT = Number(process.env.CLAUDE_WORKER_PROXY_PORT || 8788);

function log(msg: string): void {
  console.error(`[claude-worker] ${msg}`);
}

// OAuth Max token of the pool owner. Claude Code reads CLAUDE_CODE_OAUTH_TOKEN
// natively for Max-plan (flat-rate) auth; the worker just forwards it to the
// claude subprocess. Shared across all conversations on this VM (same owner).
const OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// OAuth→API-key fallback (nanoclaw parity): when BOTH an OAuth token and an API
// key exist, route the claude subprocess through a local proxy that retries on
// 429/529 with the API key + fallback model. With only one credential there's
// nothing to fall back to, so we skip the proxy and let the SDK auth directly.
const FALLBACK_ENABLED = Boolean(OAUTH_TOKEN && ANTHROPIC_API_KEY);

function buildMcpServers(): Record<string, McpServerConfig> {
  const servers: Record<string, McpServerConfig> = {};
  const easybitsKey = process.env.EASYBITS_API_KEY;
  if (easybitsKey) {
    servers.easybits = {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@easybits.cloud/mcp'],
      env: { EASYBITS_API_KEY: easybitsKey },
    };
  }
  return servers;
}

const childEnv: Record<string, string | undefined> = {
  ...process.env,
  HOME: WORKER_HOME,
  // We run as root inside a Firecracker microVM. Claude Code refuses
  // --dangerously-skip-permissions as root unless IS_SANDBOX is set — which is
  // exactly true here. Without this the claude subprocess exits 1.
  IS_SANDBOX: '1',
  ...(OAUTH_TOKEN ? { CLAUDE_CODE_OAUTH_TOKEN: OAUTH_TOKEN } : {}),
};

if (FALLBACK_ENABLED) {
  // Route the subprocess through the local fallback proxy. The proxy holds the
  // API key for the 429/529 retry, so the subprocess uses OAuth only — keep the
  // key OUT of its env so the CLI doesn't prefer it.
  childEnv.ANTHROPIC_BASE_URL = `http://127.0.0.1:${PROXY_PORT}`;
  delete childEnv.ANTHROPIC_API_KEY;
} else if (ANTHROPIC_API_KEY) {
  // No OAuth — the subprocess authenticates with the API key directly.
  childEnv.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY;
}

const config: WorkerConfig = {
  assistantName: process.env.ASSISTANT_NAME,
  systemPrompt: process.env.SYSTEM_PROMPT,
  mcpServers: buildMcpServers(),
  childEnv,
};

function sse(res: http.ServerResponse, obj: unknown): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

async function handleMessage(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body: { content?: string; sessionId?: string };
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid JSON body' }));
    return;
  }

  const content = typeof body.content === 'string' ? body.content : '';
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  if (!content || !sessionId) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'content and sessionId are required' }));
    return;
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  let streamedAny = false;
  try {
    for await (const ev of runTurn(config, sessionId, content)) {
      if (ev.type === 'token') {
        streamedAny = true;
        sse(res, { type: 'token', value: ev.value });
      } else if (ev.type === 'error') {
        sse(res, { type: 'error', message: ev.message });
        res.end();
        return;
      } else if (ev.type === 'result') {
        // Fallback: if partial streaming yielded nothing, emit the final text once.
        if (!streamedAny && ev.text) sse(res, { type: 'token', value: ev.text });
      }
      // init / activity / progress are internal — not part of the wire contract.
    }
    sse(res, { type: 'done' });
  } catch (err) {
    sse(res, { type: 'error', message: err instanceof Error ? err.message : String(err) });
  } finally {
    res.end();
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, oauth: Boolean(OAUTH_TOKEN), fallback: FALLBACK_ENABLED }));
    return;
  }
  if (req.method === 'POST' && req.url === MESSAGE_PATH) {
    handleMessage(req, res).catch((err) => {
      log(`handler error: ${err instanceof Error ? err.message : String(err)}`);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

async function main(): Promise<void> {
  if (FALLBACK_ENABLED) {
    // Start the proxy BEFORE listening so the first turn's ANTHROPIC_BASE_URL works.
    await startFallbackProxy(PROXY_PORT, ANTHROPIC_API_KEY);
  }
  server.listen(PORT, () => {
    log(
      `listening on :${PORT}${MESSAGE_PATH} (HOME=${WORKER_HOME}, oauth=${Boolean(OAUTH_TOKEN)}, fallback=${FALLBACK_ENABLED})`,
    );
    if (!OAUTH_TOKEN && !ANTHROPIC_API_KEY) {
      log('WARNING: neither CLAUDE_CODE_OAUTH_TOKEN nor ANTHROPIC_API_KEY set — the Agent SDK will fail to auth.');
    }
  });
}

main().catch((err) => {
  log(`fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
