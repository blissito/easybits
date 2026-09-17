# EasyBits — REST API v2, the calls an agent actually makes

Base: `B=https://www.easybits.cloud/api/v2` · Auth: `Authorization: Bearer $EASYBITS_API_KEY` ·
JSON bodies unless noted. Full reference per topic: `https://www.easybits.cloud/docs/<section>.md`
(sections: `quickstart`, `agents`, `hosting`, `files`, `databases`, `documents`, `flota`,
`errors`, `all-mcp-tools`…; English: `/en/docs/<section>.md`). OpenAPI 3.1: `https://www.easybits.cloud/openapi.yaml`.
Public tool catalog: `https://www.easybits.cloud/api/tools.json`.

```bash
B=https://www.easybits.cloud/api/v2
H=(-H "Authorization: Bearer $EASYBITS_API_KEY" -H "Content-Type: application/json")
```

## Sandboxes (Firecracker microVMs)

### POST /sandboxes
Body: `{ template, timeoutSeconds?, suspendOnIdle?, hardTtlSeconds?, persistent?, name?, size? }`.
→ `{ sandboxId, status, … }`. Templates:

<!-- generated:templates-en -->
| Template | Kind | Description |
|---|---|---|
| `ubuntu` | base | Full Linux. Install packages, compile, run servers. |
| `python` | base | Python runtime; each run-code is a fresh process. |
| `node` | base | Node 22 runtime; each run-code is a fresh process. |
| `bun` | base | Bun runtime. |
| `dev-box` | base | Clean work box (git, curl, build-essential, Node 22); the recommended one for SSH. |
| `code-interpreter` | base | Python + persistent Jupyter kernel (sandbox_run_cell): variables and charts survive between cells. |
| `eve-nitro` | base | Self-hosted eve (Vercel) server: Node 24, pnpm, eve CLI; persistent /data, port 3000. |
| `node-agent` | agent | Node + Claude Agent SDK pre-baked (agent_run). |
| `claude-code` | agent | Claude Agent SDK loop; per-token billing. |
| `goose` | agent | goose (AAIF), coding agent with native ACP. |
| `ghostyclaw` | agent | Always-on Ghosty daemon (WhatsApp, Slack, Telegram) with Docker and admin-api. |
| `ghosty-lite` | agent | Lightweight Rust ACP agent, multi-provider; your EasyBits key can be its brain. |
| `open-ghosty` | agent | Ghosty on open models, SSE web chat. |
| `lang-ghosty` | agent | Ghosty on LangChain, SSE web chat. |
| `rust-ghosty` | agent | DeepSeek-first Ghosty (CodeWhale/Rust) with SSE web chat and WhatsApp. |
| `ghosty-gc` | agent | Ghosty for teams (GTeams): threads, artifacts, collaborative editor. |
| `ghosty-chat` | agent | Persistent Ghosty chat (Express + SSE). |
| `cagent-ghosty` | agent | Ghosty on cagent (Docker), SSE web chat. |
| `openclaw` | agent | OpenClaw, always-on personal AI. |
| `chat-openai` | agent | Persistent Express+SSE chat on OpenAI; create it with agent_create. |
| `chat-anthropic` | agent | Persistent Express+SSE chat on Anthropic; create it with agent_create. |
| `ghosty-studio` | agent | Ghosty Studio: agent control plane inside a box. |
| `desktop-ghosty` | agent | Linux desktop with Ghosty (noVNC). |
| `computer-ghosty` | agent | Computer-use with XFCE desktop + public noVNC. |
| `computer-ghosty-gemini` | agent | Computer-use on Gemini. |
| `livekit-svc` | service | Video call room + HD recording (Studio). |
| `whisper-svc` | service | whisper STT; part of the voice box. |
| `kokoro-svc` | service | kokoro TTS; part of the voice box. |
| `voice-svc` | service | Voice (STT + TTS) for the fleet; service_start('voice'). |
| `render-svc` | service | Chromium for PDF/PNG/audits; service_start('render'). |
| `collab-svc` | service | GTeams collaborative editor (Yjs). |
| `hyperframes-svc` | service | HyperFrames video rendering. |
| `claude-worker` | internal | Fleet worker (Claude). Created by the platform. |
| `codex-worker` | internal | Fleet worker (Codex). Created by the platform. |
<!-- /generated -->

⚠️ Without `suspendOnIdle: true` the box is **destroyed** when `timeoutSeconds` (default 300 s)
expires. For anything you will talk to later, always send it.

```bash
curl -s -X POST "$B/sandboxes" "${H[@]}" \
  -d '{"template":"node","timeoutSeconds":3600,"suspendOnIdle":true}'
```

### POST /sandboxes/{id}/exec
Body: `{ command, cwd?, timeoutSeconds?, env? }` → `{ stdout, stderr, exitCode }`. Synchronous,
60 s default, 600 s max. Do not put `nohup … &` here: the shell dies with the response.

```bash
curl -s -X POST "$B/sandboxes/$SB/exec" "${H[@]}" -d '{"command":"node -v && ls /data/work"}'
```

### Background: POST /sandboxes/{id}/bg · GET /sandboxes/{id}/bg[/{execId}] · DELETE /sandboxes/{id}/bg/{execId}
Body: `{ command, cwd?, env? }` → `{ execId }`. Poll the detail for `status`, `stdout`, `stderr`.
Write the command as `exec <program>` so your process replaces the shell. **Kill it when done**
(DELETE, or `POST …/bg/{execId}/kill`): it kills the whole process group.

### POST /sandboxes/{id}/run-code
Body: `{ code, lang?, timeoutSeconds? }` → `{ stdout, stderr, exitCode }`.

### Files inside the box: POST /sandboxes/{id}/files/{write|read|list|delete|move|mkdir}
`write`: `{ path, content }` (text) · `read`: `{ path }` → `{ content }` · `list`: `{ path }`.
Working dir is `/data/work`.

### Lifecycle: POST /sandboxes/{id}/{action}
All actions (the enum is derived from the server, see `openapi.yaml`):

<!-- generated:sandbox-actions -->
- `extend`
- `suspend`
- `resume`
- `idle`
- `bootstrap`
- `snapshot`
- `fork`
- `exec`
- `run-code`
- `run-cell`
- `kernel-restart`
- `logs`
- `runtime`
- `apply-patch`
- `expose`
- `expose-raw`
- `unexpose-raw`
- `ssh-enable`
- `ssh-disable`
- `ssh-ticket`
- `domain-add`
- `domain-remove`
- `domain-list`
- `domain-verify`
- `network-policy`
<!-- /generated -->

- `idle`: `{ suspendOnIdle, idleTtlSeconds?, hardTtlSeconds? }` — change the idle policy of an
  EXISTING box: with `suspendOnIdle: true` the reaper suspends it when the TTL elapses instead of
  destroying it (resume ~1 s, state kept). Use it on boxes you created without `suspendOnIdle`.
- `expose`: `{ port }` → `{ url }` (public HTTPS, also serves WebSocket).
- `bootstrap`: `{ script, mode?: "async"|"blocking", timeoutSeconds? }` — runs on the host on
  every wake. Idempotent scripts only. Never put a credential in it.
- `fork`: copy-on-write clone → `{ sandboxId }` of the child.
- `DELETE /sandboxes/{id}` destroys it.

## Web (billed in web queries; `402` = buy a pack at `/dash/packs?tab=web`)

### POST /web/search
Body: `{ query, engine?: "google"|"bing"|"yandex"|"duckduckgo", country?: "mx"|"us"|… }`
→ `{ query, engine, results: { organic: [{ title, link, description }], … } }`.

### POST /web/fetch
Body: `{ url, country?, asMarkdown?: true, onlyMainContent?: true }` → page content. Works on
sites that block bots. Use `asMarkdown: true` unless you need raw HTML.

### POST /web/extract · GET /web/extract/{jobId}
Body: `{ input, source?, datasetId?, limit? }` → `{ jobId, status }`. Poll until `status: "done"`;
the result carries structured records (Maps, Mercado Libre, Amazon, Instagram…).

### POST /web/crawl
Body: `{ url, maxPages?, country? }`.

## Files (CDN)

### POST /files → PUT putUrl
Body: `{ fileName, contentType, size, access?: "public"|"private", region?: "LATAM"|"US"|"EU" }`
→ `{ file: { id, url, … }, putUrl }`. Then upload the raw bytes:

```bash
R=$(curl -s -X POST "$B/files" "${H[@]}" \
  -d '{"fileName":"reporte.pdf","contentType":"application/pdf","size":'$(stat -f%z reporte.pdf)',"access":"public"}')
curl -s -X PUT "$(echo "$R" | jq -r .putUrl)" -H "Content-Type: application/pdf" --data-binary @reporte.pdf
```
`file.url` is the CDN URL when `access: "public"`; private files use `readUrl` from
`GET /files/{id}` (presigned, 1 h). ⚠️ Updating a file's content gives it a **new key**: the CDN
caches the old URL.

### GET /files?limit=&cursor= · GET /files/{id} · PATCH /files/{id} · DELETE /files/{id} · POST /files/{id}/restore
Lists are `{ items, nextCursor?, hasMore }`. Delete is soft (7 days).

### Share links: POST /share-links `{ fileId, expiresIn? }` → `{ url }`.

## Databases (SQLite, one per client)

### POST /databases `{ name, description? }` → `{ id, name, namespace }`
Name: `[A-Za-z0-9_-]{1,64}`. Plan limits: Byte 3, Mega 10, Tera 20.

### POST /databases/{dbId}/query
- Query: `{ sql, args? }` → `{ cols, rows, affected_row_count, last_insert_rowid }`
- Batch: `{ statements: [{ sql, args? }] }` (max 20) → `{ results }`
- Import: `{ table, columns, rows, onConflict?: "ignore"|"replace" }` (max 10,000 rows) → `{ imported, total }`

```bash
curl -s -X POST "$B/databases/$DB/query" "${H[@]}" \
  -d '{"sql":"CREATE TABLE IF NOT EXISTS leads(id INTEGER PRIMARY KEY, email TEXT)"}'
```

### GET /databases · GET /databases/{dbId} · DELETE /databases/{dbId} (permanent)

## Hosting (a machine is its own monthly subscription, MXN)

### GET /machines/tiers
Tiers with vCPU/RAM/NVMe and `monthlyMxn`. `nano` (256 MB) does not survive a Node build;
`micro` is the real floor for a Node app.

### POST /machines/launch — the one call
Body: exactly one source, `repo` (git URL, `branch?`, `repoToken?` for private) **or**
`archiveUrl` (`.tar.gz`/`.zip`), and/or `sandboxId` (target machine to redeploy onto). Options:
`{ tier?: "micro", template?: "node", appDir?: "/app", buildCommand?, startCommand?, port?: 3000,
env?: { KEY: "value" }, secretNames?: [], dataPaths?: [], domain?, name? }`.
→ `{ url, sandboxId, releaseId, domain?: { dns } }`.

```bash
curl -s -X POST "$B/machines/launch" "${H[@]}" \
  -d '{"repo":"https://github.com/user/app.git","tier":"micro","port":3000,"startCommand":"node server.js"}'
```
Starts a monthly charge (or returns `{ checkoutUrl }` when the account has no plan: the
machine is created when payment confirms). Say the tier and price before calling.

Known traps: `npm start` with `node --env-file=.env` dies (no `.env` in the box) → pass config
via `env` and secrets; Express 5 rejects `app.all("*")` → `app.use(handler)`.

### Same machine, new code: POST /machines/launch `{ sandboxId, repo }` → new release, ~18 s.
### POST /machines/{id}/secrets `{ NAME: "value" }` · POST /machines/{id}/restart · GET /machines/{id}/logs
### GET /machines/{id}/releases · POST /machines/{id}/rollback `{ releaseId }` · GET /machines/{id}/backups
### DELETE /machines/{id} — releases the machine: stops billing (prorated) and destroys it. Destructive.

## Documents (HTML → PDF/PNG, published pages)

### POST /documents `{ name, sections?: [{ html }], theme?, customColors? }` → Document
### PATCH /documents/{id} · GET /documents/{id} · DELETE /documents/{id}
### POST /documents/{id}/deploy → `{ url, slug }` · GET /documents/{id}/pdf → PDF bytes
Write pages as `<section>` HTML with Tailwind classes; do not send a full `<!DOCTYPE>` page.
Invoices, quotes and reports are cheaper through the MCP tool `structured_doc` (templated).

## Account

### GET /account/usage → plan, storage, sandboxes, web queries, LLM tokens.
### GET /account → user and plan.

## Errors

`400` invalid body (`issues[]` from zod) · `401` bad key · `402` no balance/quota (`buy` URL
in body) · `403` scope (key lacks WRITE/DELETE) · `404` unknown id or not yours · `409` state
conflict · `429` rate limit (`Retry-After`) · `502` upstream provider · `503` service not
configured. Lists never 404 on empty: they return `{ items: [] }`.
