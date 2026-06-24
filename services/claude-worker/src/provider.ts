// ClaudeProvider — extracted from nanoclawv2 (container/agent-runner/src/providers/claude.ts)
// and adapted for the EasyBits pool worker:
//   - dropped the `db/connection` container_state writes (the host sweep used them;
//     here SSE `activity` is the liveness signal instead).
//   - one prompt per turn (no MessageStream push loop — the worker runs query-per-message
//     and relies on --resume for continuity).
//   - real token streaming via includePartialMessages → `token` events.
//   - PreCompact archive writes under /data instead of /workspace/agent.
import fs from 'fs';
import path from 'path';

import { query as sdkQuery, type HookCallback, type PreCompactHookInput } from '@anthropic-ai/claude-agent-sdk';

import type { AgentProvider, AgentQuery, McpServerConfig, ProviderEvent, ProviderOptions, QueryInput } from './types.js';

const DATA_DIR = process.env.CLAUDE_WORKER_DATA_DIR || '/data';

function log(msg: string): void {
  console.error(`[claude-provider] ${msg}`);
}

// SDK builtins that don't fit a headless message-passing worker (they target
// Claude Code's interactive UI and would hang). Same list as nanoclaw.
const SDK_DISALLOWED_TOOLS = [
  'CronCreate',
  'CronDelete',
  'CronList',
  'ScheduleWakeup',
  'AskUserQuestion',
  'EnterPlanMode',
  'ExitPlanMode',
  'EnterWorktree',
  'ExitWorktree',
];

const TOOL_ALLOWLIST = [
  'Bash',
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'Task',
  'TaskOutput',
  'TaskStop',
  'TodoWrite',
  'ToolSearch',
  'Skill',
  'NotebookEdit',
  'mcp__easybits__*',
];

// ── Transcript archiving (PreCompact hook) ──

interface ParsedMessage {
  role: 'user' | 'assistant';
  content: string;
}

function parseTranscript(content: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'user' && entry.message?.content) {
        const text =
          typeof entry.message.content === 'string'
            ? entry.message.content
            : entry.message.content.map((c: { text?: string }) => c.text || '').join('');
        if (text) messages.push({ role: 'user', content: text });
      } else if (entry.type === 'assistant' && entry.message?.content) {
        const textParts = entry.message.content
          .filter((c: { type: string }) => c.type === 'text')
          .map((c: { text: string }) => c.text);
        const text = textParts.join('');
        if (text) messages.push({ role: 'assistant', content: text });
      }
    } catch {
      /* skip unparseable lines */
    }
  }
  return messages;
}

function formatTranscriptMarkdown(messages: ParsedMessage[], title?: string | null, assistantName?: string): string {
  const now = new Date();
  const dateStr = now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  const lines = [`# ${title || 'Conversation'}`, '', `Archived: ${dateStr}`, '', '---', ''];
  for (const msg of messages) {
    const sender = msg.role === 'user' ? 'User' : assistantName || 'Assistant';
    const content = msg.content.length > 2000 ? msg.content.slice(0, 2000) + '...' : msg.content;
    lines.push(`**${sender}**: ${content}`, '');
  }
  return lines.join('\n');
}

const preToolUseHook: HookCallback = async (input) => {
  const i = input as { tool_name?: string };
  const toolName = i.tool_name ?? '';
  if (SDK_DISALLOWED_TOOLS.includes(toolName)) {
    return {
      decision: 'block',
      stopReason: `Tool '${toolName}' is not available in this environment.`,
    } as unknown as ReturnType<HookCallback>;
  }
  return { continue: true };
};

function createPreCompactHook(assistantName?: string): HookCallback {
  return async (input) => {
    const preCompact = input as PreCompactHookInput;
    const { transcript_path: transcriptPath, session_id: sessionId } = preCompact;
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return {};
    try {
      const content = fs.readFileSync(transcriptPath, 'utf-8');
      const messages = parseTranscript(content);
      if (messages.length === 0) return {};

      let summary: string | undefined;
      const indexPath = path.join(path.dirname(transcriptPath), 'sessions-index.json');
      if (fs.existsSync(indexPath)) {
        try {
          const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
          summary = index.entries?.find((e: { sessionId: string; summary?: string }) => e.sessionId === sessionId)?.summary;
        } catch {
          /* ignore */
        }
      }
      const name = summary
        ? summary.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
        : `conversation-${new Date().getHours().toString().padStart(2, '0')}${new Date().getMinutes().toString().padStart(2, '0')}`;
      const conversationsDir = path.join(DATA_DIR, 'conversations');
      fs.mkdirSync(conversationsDir, { recursive: true });
      const filename = `${new Date().toISOString().split('T')[0]}-${name}.md`;
      fs.writeFileSync(path.join(conversationsDir, filename), formatTranscriptMarkdown(messages, summary, assistantName));
      log(`Archived conversation to ${filename}`);
    } catch (err) {
      log(`Failed to archive transcript: ${err instanceof Error ? err.message : String(err)}`);
    }
    return {};
  };
}

// ── Provider ──

const CLAUDE_CODE_AUTO_COMPACT_WINDOW = '165000';
const STALE_SESSION_RE = /no conversation found|ENOENT.*\.jsonl|session.*not found/i;

export class ClaudeProvider implements AgentProvider {
  private assistantName?: string;
  private mcpServers: Record<string, McpServerConfig>;
  private env: Record<string, string | undefined>;
  private additionalDirectories?: string[];

  constructor(options: ProviderOptions = {}) {
    this.assistantName = options.assistantName;
    this.mcpServers = options.mcpServers ?? {};
    this.additionalDirectories = options.additionalDirectories;
    this.env = {
      ...(options.env ?? {}),
      CLAUDE_CODE_AUTO_COMPACT_WINDOW,
    };
  }

  isSessionInvalid(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return STALE_SESSION_RE.test(msg);
  }

  query(input: QueryInput): AgentQuery {
    const instructions = input.systemContext?.instructions;
    const claudeExecutable = process.env.CLAUDE_CODE_EXECUTABLE;

    const sdkResult = sdkQuery({
      prompt: input.prompt,
      options: {
        cwd: input.cwd,
        additionalDirectories: this.additionalDirectories,
        resume: input.continuation,
        includePartialMessages: true,
        ...(claudeExecutable ? { pathToClaudeCodeExecutable: claudeExecutable } : {}),
        systemPrompt: instructions
          ? { type: 'preset' as const, preset: 'claude_code' as const, append: instructions }
          : undefined,
        allowedTools: TOOL_ALLOWLIST,
        disallowedTools: SDK_DISALLOWED_TOOLS,
        env: this.env,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        settingSources: ['project', 'user'],
        mcpServers: this.mcpServers,
        // Surface the claude subprocess's stderr — the SDK otherwise swallows it,
        // so a spawn failure shows only "process exited with code 1". (That cost
        // a real debugging session: root + --dangerously-skip-permissions needs
        // IS_SANDBOX=1, which only stderr revealed.)
        stderr: (data: string) => log(`child stderr: ${String(data).trimEnd()}`),
        hooks: {
          PreToolUse: [{ hooks: [preToolUseHook] }],
          PreCompact: [{ hooks: [createPreCompactHook(this.assistantName)] }],
        },
      },
    });

    let aborted = false;

    async function* translateEvents(): AsyncGenerator<ProviderEvent> {
      for await (const message of sdkResult) {
        if (aborted) return;
        yield { type: 'activity' };

        if (message.type === 'system' && message.subtype === 'init') {
          yield { type: 'init', continuation: message.session_id };
        } else if (message.type === 'stream_event') {
          // Real streaming: translate Anthropic text_delta into token events.
          const ev = (message as { event?: { type?: string; delta?: { type?: string; text?: string } } }).event;
          if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
            yield { type: 'token', value: ev.delta.text };
          }
        } else if (message.type === 'result') {
          const text = 'result' in message ? (message as { result?: string }).result ?? null : null;
          const m = message as {
            usage?: {
              input_tokens?: number;
              output_tokens?: number;
              cache_creation_input_tokens?: number;
              cache_read_input_tokens?: number;
              service_tier?: string;
            };
            modelUsage?: Record<string, unknown>;
          };
          const u = m.usage;
          const usage =
            u && typeof u.input_tokens === 'number' && typeof u.output_tokens === 'number'
              ? {
                  input_tokens: u.input_tokens,
                  output_tokens: u.output_tokens,
                  cache_creation_input_tokens: u.cache_creation_input_tokens,
                  cache_read_input_tokens: u.cache_read_input_tokens,
                  service_tier: u.service_tier,
                }
              : undefined;
          const model = m.modelUsage ? Object.keys(m.modelUsage)[0] : undefined;
          yield { type: 'result', text, usage, model };
        } else if (message.type === 'rate_limit_event') {
          // The SDK emits this on every turn with status "allowed" (informational).
          // Only a non-allowed status is an actual quota block worth surfacing.
          const info = (message as { rate_limit_info?: { status?: string } }).rate_limit_info;
          if (info?.status && info.status !== 'allowed') {
            yield { type: 'error', message: `Rate limited (${info.status})`, retryable: true, classification: 'quota' };
          }
        }
      }
    }

    return {
      events: translateEvents(),
      abort: () => {
        aborted = true;
      },
    };
  }
}
