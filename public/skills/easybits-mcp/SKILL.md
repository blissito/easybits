---
name: easybits-mcp
description: Connect the EasyBits MCP server (sandboxes, web, files, SQL databases, documents, hosting, fleet agents) to Claude Code, Cursor, Codex, Claude.ai or any MCP client, choosing the right tool groups and the stdio proxy or Streamable HTTP. Use when the user wants EasyBits tools available in every chat, asks to add the EasyBits MCP, or mentions @easybits.cloud/mcp or easybits.cloud.
license: MIT
compatibility: Node 18+ for the stdio proxy (npx), network access to https://www.easybits.cloud and an EasyBits API key (Claude.ai uses OAuth instead)
metadata:
  author: easybits
  version: "1.0"
---

# Connect the EasyBits MCP

One endpoint, `https://www.easybits.cloud/api/mcp`, Streamable HTTP. Tools are split in
groups so the agent loads only what it needs; the group goes in the path
(`/api/mcp/core,sandbox`) or after `--tools` in the stdio proxy.

## Install

| Client | Command or config |
|---|---|
| Claude Code (stdio proxy) | `claude mcp add easybits -- npx -y @easybits.cloud/mcp --key $EASYBITS_API_KEY --tools core,sandbox` |
| Claude Code (HTTP) | `claude mcp add --transport http easybits https://www.easybits.cloud/api/mcp/core,sandbox --header "Authorization: Bearer $EASYBITS_API_KEY"` |
| Cursor / VS Code / Windsurf / Codex | `mcp.json`: `{ "mcpServers": { "easybits": { "type": "streamable-http", "url": "https://www.easybits.cloud/api/mcp/core,sandbox", "headers": { "Authorization": "Bearer $EASYBITS_API_KEY" } } } }` |
| Claude.ai / Cowork | Settings → Connectors → custom connector with `https://www.easybits.cloud/api/mcp/<groups>`; OAuth 2.1, no key |
| Ghosty Code | preinstalled: `ghosty auth set --provider easybits --api-key $EASYBITS_API_KEY` |

## Groups

| Group | Holds |
|---|---|
| `core` (default) | files, databases, documents, forms, websites, brand kits |
| `sandbox` | microVMs: create/exec/bg/run-code/files/expose/snapshot/fork/bootstrap |
| `web` | `web_search`, `web_fetch`, `web_extract`, `web_crawl` (billed in web queries) |
| `hosting` | `launch_app`, machines, releases, rollback, secrets, logs, domains |
| `docs` | documents only: `structured_doc`, pages, deploy, PDF |
| `fleet` | agents on WhatsApp/WABA/Teams/web: prompt, engine, connectors, skills |
| `video`, `payments`, `email`, `brand`, `sites`, `magnet` | one product each |
| `scripting` | Code Mode: `discover_tools` + `run_tool` instead of ~140 schemas |
| `all` | everything (~250 tools). Evaluation only: it floods tool choice |

Public catalog without an account: `https://www.easybits.cloud/api/tools.json`.

## Rules

- **Pick groups for the task**, combined with commas. `all` makes the model choose badly.
- **Clients cache `tools/list` at session start.** After changing groups or after a deploy, restart
  the client or open a new chat; otherwise "the tool is missing" is a stale session, not a bug.
- **Same shape in every tool**: JSON in `content[0].text` and `structuredContent`; errors are
  `{ error }` with `isError: true`; every `list_*` returns `{ items, nextCursor, hasMore }`;
  `{ noop: true }` means nothing changed, do not retry.
- **Do not load the MCP for one call.** A coding agent with a shell does one `curl` cheaper
  (see the `easybits` skill). The MCP is for tools that must be present in every conversation.
- Never write the key into a committed config: use `$EASYBITS_API_KEY` or the client's secret store.

## After changes

Tell the user which groups are active and suggest a test: "Ask: *lista mis archivos en
EasyBits*" or "*crea un sandbox node y corre node -v*".
