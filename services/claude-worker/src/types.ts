// Provider contract — extracted from nanoclawv2 (container/agent-runner/src/providers/types.ts)
// and trimmed to what the worker needs. The `token` event is added here for the
// SSE streaming transport (the original yielded only the final `result`).

export interface McpStdioServerConfig {
  type?: 'stdio';
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface McpHttpServerConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig;

export interface TurnUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  service_tier?: string;
}

export type ProviderEvent =
  // SDK session id for this turn — persisted so the next turn can --resume it.
  | { type: 'init'; continuation: string }
  // Incremental assistant text (real streaming, from includePartialMessages).
  | { type: 'token'; value: string }
  // End of turn. `text` is the full final assistant text (fallback if no tokens streamed).
  | { type: 'result'; text: string | null; usage?: TurnUsage; model?: string }
  | { type: 'error'; message: string; retryable: boolean; classification?: string }
  | { type: 'progress'; message: string }
  // Liveness — emitted on every underlying SDK event.
  | { type: 'activity' };

export interface ProviderOptions {
  assistantName?: string;
  mcpServers?: Record<string, McpServerConfig>;
  env?: Record<string, string | undefined>;
  additionalDirectories?: string[];
}

export interface QueryInput {
  /** User message for this turn. */
  prompt: string;
  /** SDK session id from a previous turn (resume handle). Undefined on first turn. */
  continuation?: string;
  /** Working directory for this conversation. */
  cwd: string;
  systemContext?: { instructions?: string };
}

export interface AgentQuery {
  events: AsyncIterable<ProviderEvent>;
  abort(): void;
}

export interface AgentProvider {
  query(input: QueryInput): AgentQuery;
  /** True if the error means the stored continuation is dead and should be cleared. */
  isSessionInvalid(err: unknown): boolean;
}
