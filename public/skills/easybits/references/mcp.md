# EasyBits — MCP server (persistent tools for every chat)

Endpoint: `https://www.easybits.cloud/api/mcp` (Streamable HTTP). Auth: `Authorization: Bearer $EASYBITS_API_KEY`.
Public catalog (no auth): `https://www.easybits.cloud/api/tools.json`. Docs MCP (no auth): `https://www.easybits.cloud/mcp/docs`.

## Install

```bash
# Claude Code — stdio proxy, groups after --tools
claude mcp add easybits -- npx -y @easybits.cloud/mcp --key $EASYBITS_API_KEY --tools core,sandbox

# Claude Code — direct HTTP, groups in the PATH
claude mcp add --transport http easybits https://www.easybits.cloud/api/mcp/core,sandbox \
  --header "Authorization: Bearer $EASYBITS_API_KEY"
```

Cursor / VS Code / Windsurf / Codex (`mcp.json`):

```json
{
  "mcpServers": {
    "easybits": {
      "type": "streamable-http",
      "url": "https://www.easybits.cloud/api/mcp/core,sandbox",
      "headers": { "Authorization": "Bearer $EASYBITS_API_KEY" }
    }
  }
}
```

Claude.ai / Cowork: add `https://www.easybits.cloud/api/mcp/<groups>` as a custom connector; OAuth 2.1 handles auth, no key.

## Tool groups (load only what the task needs)

| Group | What it holds |
|---|---|
| `core` (default) | files, databases, documents, forms, websites, brand kits |
| `sandbox` | create/exec/bg/run-code/files/expose/snapshot/fork/template-snapshot (derived templates)/network-policy/bootstrap on microVMs |
| `web` | `web_search`, `web_fetch`, `web_extract`, `web_crawl` (billed in web queries) |
| `hosting` | `launch_app`, `create_machine`, releases, rollback, secrets, logs, domains |
| `docs` | documents only: `structured_doc`, pages, deploy, PDF |
| `fleet` | agents on WhatsApp/WABA/Teams/web: prompt, engine, connectors, skills |
| `video`, `payments`, `email`, `brand`, `sites`, `magnet` | one product each |
| `scripting` | Code Mode: `discover_tools` + `run_tool` instead of ~140 schemas (for models that cannot afford the catalog) |
| `all` | everything (~250 tools). Only for evaluation; it floods tool choice |

Combine with commas: `core,sandbox,web`. Clients cache `tools/list` at session start: after
changing groups, restart the client or open a new chat.

## Same shape everywhere

Every tool returns JSON in `content[0].text` and in `structuredContent`. Errors come as
`{ error, ... }` with `isError: true`. Every `list_*` returns `{ items, nextCursor, hasMore }`.
A `{ noop: true }` means nothing changed: do not retry.

## When not to use the MCP

A coding agent that already has a shell does one `curl` faster than loading a catalog.
Use the MCP when the user wants the tools present in every future conversation, or in a
client without shell (Claude.ai, Cowork).
