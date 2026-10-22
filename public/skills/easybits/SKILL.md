---
name: easybits
description: Use EasyBits cloud (easybits.cloud) from a coding agent - run code in a Firecracker sandbox, search and read the web, store and serve files on a CDN, create SQL databases, produce PDF documents, and deploy an app to a public URL, through the MCP server, the REST API v2 or the typed SDK with the user's API key. Use when the user mentions EasyBits, Easybits, easybits.cloud, wants their agent to have a sandbox, web access, file storage, a database or hosting, or asks to deploy an app to EasyBits.
license: MIT
compatibility: Needs curl or any HTTP client, network access to https://www.easybits.cloud and an EasyBits API key
metadata:
  author: easybits
  version: "1.7"
---

# Use EasyBits from a coding agent

EasyBits is a cloud for AI agents, billed in MXN. One API key gives an agent: **sandboxes**
(Firecracker microVMs with root and internet), **web** (search, fetch any page, structured
extraction), **files** (CDN, versions, share links), **databases** (SQLite-as-a-service),
**documents** (HTML to PDF/PNG, invoices, carousels), **hosting** (an app on a public URL in one
call) and a **fleet** of agents on WhatsApp, Teams and web widgets.

## Setup (once)

1. Ask the user for their API key. It is created in EasyBits → **Dashboard de Desarrollador →
   API keys** (`https://www.easybits.cloud/dash/developer`). It looks like `eb_sk_live_…`.
2. Keep it in an env var, never in command arguments or committed files:

```bash
export EASYBITS_API_KEY="eb_sk_live_…"
```

Base URL: `https://www.easybits.cloud/api/v2`. Every call:
`-H "Authorization: Bearer $EASYBITS_API_KEY"`. Wrong key → `401` (do not retry).

## Pick the surface

| Situation | Use |
|---|---|
| You are a coding agent doing the work yourself (Claude Code, Cursor, Codex) | **REST** with `curl`, or the SDK inside a script. Read `references/api.md`. |
| The user wants the tools available in every chat | **MCP**: `claude mcp add easybits -- npx -y @easybits.cloud/mcp --key $EASYBITS_API_KEY --tools core,sandbox`. Read `references/mcp.md`. |
| The user's own app or agent calls EasyBits | **SDK**: `npm i @easybits.cloud/sdk`, `new EasybitsClient({ apiKey })`. |

Do not load the MCP just to make one call: a `curl` is cheaper than a tool catalog.

## What you can do

| User asks | Do |
|---|---|
| "run this code / give my agent a machine" | `POST /sandboxes` with `{ template, suspendOnIdle: true, timeoutSeconds }`, poll `GET /sandboxes/:id` until `status: "running"` (else `409 SandboxNotReady`), then `POST /sandboxes/:id/exec`; files go in with `POST /sandboxes/:id/files/write` `{ path, content }` |
| "run a build / a dev server / something long" | `POST /sandboxes/:id/bg` (background), poll `GET /sandboxes/:id/bg/:execId`, and **kill it when done** |
| "search the web / read this page even if it blocks bots" | `POST /web/search` · `POST /web/fetch` (costs web queries; `402` = the user must buy a pack) |
| "extract listings from Maps / Mercado Libre / Amazon" | `POST /web/extract` → job, poll `GET /web/extract/:jobId` |
| "store / serve / share this file" | `POST /files` → `PUT putUrl` with the bytes; `access: "public"` for a CDN URL |
| "my agent needs a database" | `POST /databases`, then `POST /databases/:id/query` with `{ sql, args }` |
| "deploy this app / put it on a URL" | `POST /machines/launch` with exactly one of `repo`, `archiveUrl`, `sandboxId`. Nothing else: it builds, releases and exposes |
| "run this every day / once at 23:00 / tell me when it ends" | `POST /crons` (`cron`, or one-off `at`/`in`; action `http`, `agent` or `exec` = a command in a throwaway box), then `GET /crons/:id/runs/next` waits for the run. `notify` push/email/inbox; event inboxes (`POST /inboxes` → a public URL any webhook can POST to) |
| "make a PDF / invoice / quote" | `structured_doc` (MCP) or `POST /documents` with HTML sections; see the `documents` docs section |
| "what tools does EasyBits have?" | `GET https://www.easybits.cloud/api/tools.json` (no auth) |
| "how does X work in EasyBits?" | Read `https://www.easybits.cloud/docs/<section>.md` or `https://www.easybits.cloud/llms.txt` (index) |

Read `references/api.md` for exact request/response shapes before calling. Task-specific skills
from the same publisher go deeper: `easybits-sandbox` (boxes), `easybits-agent` (persistent
agents you talk to), `easybits-mcp` (the MCP server), `easybits-docs` (reading the docs).

## Rules

- **`suspendOnIdle: true` on every sandbox that must survive.** Without it the box is
  destroyed when `timeoutSeconds` expires (default 300 s), and its URL dies with it.
- **Background, not `nohup`.** `exec` kills its shell when it responds and takes children with
  it. Long processes go through `/bg`; finish with the kill call or they eat the box until TTL.
- **Read before write.** `GET` a resource before `PATCH`. Send only the fields the user asked
  to change.
- **Do not retry a `401`, `402`, `404` or `409`.** They are answers, not glitches: wrong key,
  no balance, wrong id, conflicting state. Tell the user and stop. The one `409` worth waiting
  on is `SandboxNotReady` (box still `starting`): poll `GET /sandboxes/:id` until `running`.
- **Do not retry a `{ noop: true }`.** The server is telling you nothing changed.
- **Prefer `launch_app` over hand-chaining** create → deploy → expose → domain. Done by hand,
  the step that gets skipped is the release, and a machine without a release cannot be rebuilt.
- **Build inside the box, never on the user's Mac.** Native modules compiled on macOS crash
  on Linux.
- **Never print the API key** back to the user, into logs or into a file in the repo.
- **Money moves:** `POST /machines` and `POST /machines/launch` start a monthly charge (or
  return a `checkoutUrl` when there is no plan). Say the tier and the MXN price before calling.
- Currency is MXN; plans gate storage, AI and fleet. Hosting bills on its own subscription.

## Recipe: scheduled reports from an app's data

A deployed app's database (`DATABASE_URL=http://172.20.0.1:8090/v1/db/<app>/`) is reachable
**only from inside its machine**, so never try to query it from outside or with `db_query`.
Do this instead:
1. Add a route to the app (e.g. `POST /api/reports/<name>`) that runs the SQL and returns the
   numbers; protect it with a machine secret (`easybits machines secrets set <machine> --dotenv -`,
   then `machines restart`). **Numbers come from SQL, never from you adding rows.**
2. Output: JSON/CSV, or a PDF with `structured_doc`; store or email it from the app.
3. Trigger: an in-app timer only if the machine doesn't sleep; otherwise call the URL from outside
   with the secret (it wakes the box) — e.g. a GitHub Actions schedule or a Ghosty scheduled turn
   (`ghosty schedule add <agent> "…" --at <ISO> --every 24h`).
4. If an agent writes the summary, it reads the route's numbers and only interprets them.
Full walkthrough: https://www.easybits.cloud/docs/hosting.md (section "Reportes programados").

## After changes

Tell the user in one line what exists now (id, URL) and suggest a check they can run, e.g.
"Ask your agent: *¿qué hay en /data/work de mi sandbox?*" or "Open `<url>` in a browser".
