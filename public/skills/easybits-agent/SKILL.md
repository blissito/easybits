---
name: easybits-agent
description: Create a persistent agent on EasyBits (ghosty-lite, goose, claude-code, each in its own microVM with a stable URL) and talk to it over HTTP or ACP - choose the brain (EasyBits metered key, Anthropic, DeepSeek, Claude subscription), seed files, attach MCP servers, send messages, revive it. Use when the user wants an agent that keeps running with its own disk and memory, an ACP agent for their editor, or mentions EasyBits agents or easybits.cloud.
license: MIT
compatibility: Needs curl or any HTTP client, network access to https://www.easybits.cloud and an EasyBits API key
metadata:
  author: easybits
  version: "1.0"
---

# Create and talk to an EasyBits agent

An EasyBits agent is a microVM with an agent runtime inside and a stable HTTPS/WebSocket URL
that outlives the machine. It keeps its disk (`/data`) and its session between turns.

## Setup (once)

```bash
export EASYBITS_API_KEY="eb_sk_live_…"
B=https://www.easybits.cloud/api/v2
H=(-H "Authorization: Bearer $EASYBITS_API_KEY" -H "Content-Type: application/json")
```

## What you can do

| User asks | Do |
|---|---|
| "create an agent" | `POST $B/agents` `{ "template": "ghosty-lite", "env": {}, "name": "…" }` → `{ agentId, sandboxId, agentUrl, status: "building" }` |
| "use my Anthropic / DeepSeek key" | same, with `env: { "GHOSTY_PROVIDER": "anthropic", "GHOSTY_MODEL": "claude-haiku-4-5", "ANTHROPIC_API_KEY": "…" }` (goose: `GOOSE_PROVIDER`/`GOOSE_MODEL`) |
| "use my Claude subscription" | `env: { "CLAUDE_CODE_OAUTH_TOKEN": "<from claude setup-token>" }` → provider `claude-acp`, flat rate |
| "give it these files" | `seedFiles: [{ "name": "guia.md", "contentBase64": "…" }]` at creation (flattened into `/data/workspace`) |
| "connect it to this MCP" | `mcpServers: [{ "name", "type": "http", "url", "headers"? }]` or stdio `{ "name", "command", "args" }` at creation; `$secret:NAME` resolves from the vault |
| "is it ready?" | `GET $B/agents/$ID` until `status: "running"` (~6 s for ACP templates) |
| "send it a message" | `POST $B/agents/$ID/message` `{ "content": "…" }` → SSE `chunk`… `usage`, `done` |
| "connect my editor (Zed, VS Code, JetBrains)" | create with `env.ACP_AGENT_TOKEN`, then `npx ghosty-acp wss://acp-$ID.sandboxes.easybits.cloud/acp?token=$ACP_AGENT_TOKEN` |
| "it stopped answering" | `POST $B/agents/$ID/revive` (wait for the response, 10-60 s; do not retry). `/message` does it alone when the agent is `lost` |
| "what did it write?" | `POST $B/sandboxes/$SANDBOX/exec` `{ "command": "ls /data" }` — the machine is the user's |
| "destroy it" | `DELETE $B/agents/$ID` |

## Rules

- **`env` is required**, `{}` when the template needs nothing. With `ghosty-lite` and `env: {}`
  the brain is the user's own EasyBits key (provider `easybits`, model `deepseek-v4-pro`): turns
  are billed from **their** LLM tokens (`GET $B/llm/balance`).
- **Wait for `running` before the first message.** Before that there is no session.
- **`claude-acp` accepts HTTP MCPs only** (stdio is rejected with 400). Run a Streamable HTTP
  server inside the box (seed it) and declare `{ type: "http", url: "http://127.0.0.1:<port>/mcp" }`.
- **Revive loses `/data` of the old machine** but keeps the URL and the `agentId`. Tell the user.
- The SSE `usage` event is the session total, not the turn.
- Never print `EASYBITS_API_KEY`, `ACP_AGENT_TOKEN` or provider keys back to the user.
- For agents on WhatsApp, Teams or a web widget the product is the **fleet**
  (`/docs/flota.md`), not this API.

Reference: `https://www.easybits.cloud/docs/agents.md` (section "Agentes persistentes").

## After changes

Give the user `agentId` and `agentUrl`, and suggest a first message: "Send it *¿qué
archivos tienes en /data/workspace?*".
