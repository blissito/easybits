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
Templates: `code-interpreter` (Python + Jupyter), `python`, `node`, `bun`, `ubuntu`, `claude-code`,
`ghosty-lite`, `goose`. → `{ sandboxId, status, … }`.

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

### Lifecycle: POST /sandboxes/{id}/{extend|suspend|resume|snapshot|fork|expose|bootstrap}
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
