---
name: easybits-docs
description: Read the EasyBits documentation from an agent without scraping - every section as raw markdown, llms.txt, the docs MCP server (search_docs, read_doc, list_docs, tools_catalog) and the public tool catalog. Use when the user asks how something works in EasyBits or easybits.cloud, or before calling its API or MCP.
license: MIT
compatibility: Network access to https://www.easybits.cloud
metadata:
  author: easybits
  version: "1.0"
---

# Read the EasyBits docs

EasyBits publishes its documentation for agents first. Never scrape the HTML: every section
has a machine-readable twin.

## Pick the cheapest source

| Need | Fetch |
|---|---|
| The map of every section (one line each) | `https://www.easybits.cloud/llms.txt` |
| Everything at once (~100 KB) | `https://www.easybits.cloud/llms-full.txt` |
| One section as markdown | `https://www.easybits.cloud/docs/<section>.md` (e.g. `agents`, `hosting`, `files`, `databases`, `web`, `documents`, `flota`, `errors`) |
| The docs page when you only have its HTML URL | `GET https://www.easybits.cloud/docs` with `Accept: text/markdown` |
| What the MCP can do, without an account | `https://www.easybits.cloud/api/tools.json` |
| Full tool catalog and groups as markdown | `/docs/all-mcp-tools.md` and `/docs/tool-groups.md` |

Docs are in Spanish; JSON field names, tool names and endpoints are the contract and never
change with the language.

## Use the MCP server when you can

`https://www.easybits.cloud/mcp/docs` is a Streamable HTTP MCP server, no auth, JSON-RPC over
`POST`. Tools:

- `search_docs { query }` — lexical search by heading and text, up to 8 fragments with the
  section and its `.md` URL. Call this first.
- `read_doc { section }` — a whole section as markdown.
- `list_docs {}` — every section with its title and URL.
- `tools_catalog { group? }` — the product MCP's tools (name, description, group).

Claude Code: `claude mcp add --transport http easybits-docs https://www.easybits.cloud/mcp/docs`.

Without MCP, the same tools in plain HTTP:

```bash
curl -s https://www.easybits.cloud/mcp/docs -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_docs","arguments":{"query":"launch_app"}}}'
```

## Rules

- Search, then read one section. Do not read `llms-full.txt` for a single question.
- Quote the `.md` URL you used when you answer; the user may want to open it.
- The section `about` answers "what is this and is it for me"; `quickstart` has the first
  call; `errors` has every status code and what to do with it.
- To *do* things (create a sandbox, deploy, upload) use the `easybits` skill, which has the
  key flow. This skill is read-only.

## After answering

Offer the next step in one line, e.g. "Want me to run this against your account? I need your
`EASYBITS_API_KEY`."
