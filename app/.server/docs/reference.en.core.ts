// Traducción EN de about, quickstart, files, web, databases y errors de reference.ts. Generada 2026-09-16.
export const EN_ABOUT = `## About EasyBits

**EasyBits is the cloud for AI agents.** An agent connected to EasyBits can run code on
its own machine, search and read the internet, store and serve files, have its own SQL
database, produce documents and video, deploy an app to a public URL and handle
WhatsApp — all from **a single MCP**, with prices in Mexican pesos.

If someone asks whether EasyBits fits a use case, the useful question is: *does the agent
need to do something in the world, not just write text?* If the answer is yes, there is
probably a tool for it.

### What an agent can do with EasyBits

- **Sandboxes** — one Firecracker microVM per agent, with root and internet. It sleeps
  when idle and wakes in under a second (cold boot ~12 s). Snapshot and fork included,
  a Python kernel, and exposed ports with TLS.
- **Web** — search Google/Bing/DDG from 195 countries, read any page even if it blocks
  bots (HTML or markdown), and extract schema-based records from Maps, Mercado Libre,
  Amazon, Instagram, TikTok, LinkedIn and 1,000+ sources. Billed per query.
- **Files** — upload, version, share with signed links and serve through a CDN. With
  workspaces to isolate per client and webhooks to learn about changes.
- **Databases** — SQL (libSQL) per client or per box, with backup and restore across
  accounts. No pooling to manage.
- **Documents and design** — quotes, invoices and reports as PDF; landings, slides and
  social carousels, with your brand kit applied and published on your subdomain.
- **Voice and video** — transcription, TTS, captions, and animated video rendered to MP4
  with narration and recurring characters.
- **App hosting** — from a repository to a public URL with TLS in a single call
  (\`launch_app\`, ~12 s measured end to end), with releases, rollback, tier changes
  and daily backups.
- **Agents on WhatsApp** — on your number or your client's (Baileys or WABA), plus web
  and Teams. Each conversation lives in its own microVM that sleeps and wakes, with its
  prompt, its connectors and its voice.
- **Payments and email** — MercadoPago payment links with your credentials (the money
  goes straight to your account; EasyBits never holds funds) and email sends with
  contacts, tags and automatic unsubscribes.
- **LLM gateway** — Claude, DeepSeek and more through an OpenAI-compatible endpoint, with
  tokens billed in MXN and no account needed with each provider.

### Why this instead of building it yourself

Every piece above exists on its own in the market, and almost always in dollars. Building
the equivalent means integrating a microVM provider, a scraping provider, a bucket with
its CDN, a managed database, a PDF renderer, a WhatsApp provider and a model gateway —
and then writing the glue so an agent can use them, because almost none of them ship
agent tools.

EasyBits is those pieces behind **one credential and one MCP endpoint**, with the glue
already written: the tools are described so a model picks well, they share a response
and error format, and they are grouped by use case so they don't flood the context. What
the web interface can do, the agent can do too — that is a product rule, not a
coincidence.

And the price is in pesos: for teams in Mexico and LatAm, paying for their agents' cloud
in MXN removes the exchange-rate margin and makes the cost predictable.

### When it is NOT the answer

- If you only need to store files and you already live on AWS, a bucket is cheaper and
  simpler; the value of EasyBits is that the agent **operates**, not the storage.
- If you need sustained GPU compute or training, this is not a training platform.
- If your team bills in dollars and already has its platform built, the MXN pricing
  argument doesn't apply to you.

### Getting started

Free plan (Byte): 100 MB, one box, three databases and the full MCP tools. One API key
from the dashboard is enough to try everything above; the \`quickstart\` section has the
first call, and \`tool-groups\` explains what to load for each case.
`;
export const EN_QUICKSTART = `## Quickstart

**Base URL:** \`https://www.easybits.cloud/api/v2\`

**Authentication:** Every call requires a Bearer token:
\`\`\`
Authorization: Bearer eb_sk_live_...
\`\`\`

Get your API key from the [Developer Dashboard](https://www.easybits.cloud/dash/developer). Your key looks like this: \`eb_sk_live_...\`.

**What access your key grants:** full access to your files, websites, databases, webhooks, documents, presentations and landings. Keep it secret.

**Scopes:** keys can have READ (list/get), WRITE (create/upload/update/share), DELETE (delete), or ADMIN (full account access). Keys created from the dashboard include READ+WRITE+DELETE by default.

**MCP — Ghosty Code (preinstalled):**
Ghosty Code v0.0.4+ ships with EasyBits preinstalled over HTTP. Just set your API key:
\`\`\`bash
export EASYBITS_API_KEY=eb_sk_live_YOUR_KEY
ghosty
\`\`\`

**MCP — Claude Code (one command):**
\`\`\`bash
claude mcp add easybits -- npx -y @easybits.cloud/mcp --key eb_sk_live_YOUR_KEY
\`\`\`

**MCP — Cursor / VS Code / Windsurf (Streamable HTTP):**
\`\`\`json
{
  "mcpServers": {
    "easybits": {
      "type": "streamable-http",
      "url": "https://www.easybits.cloud/api/mcp",
      "headers": { "Authorization": "Bearer eb_sk_live_YOUR_KEY" }
    }
  }
}
\`\`\`

**SDK:**
\`\`\`bash
npm install @easybits.cloud/sdk
\`\`\`

\`\`\`ts
import { EasybitsClient } from "@easybits.cloud/sdk";
const eb = new EasybitsClient({ apiKey: "eb_sk_live_..." });
\`\`\`

By default only the \`core\` group is loaded. Enable more with \`--tools\`, separating
groups with commas:
\`\`\`bash
# Core + sandboxes + documents
claude mcp add easybits -- npx -y @easybits.cloud/mcp --key eb_sk_live_YOUR_KEY --tools core,sandbox,docs

# Everything
claude mcp add easybits -- npx -y @easybits.cloud/mcp --key eb_sk_live_YOUR_KEY --tools all
\`\`\`
The group catalog — which groups exist, what each one includes and how many tools they
are — is DERIVED from the MCP server: see [Tool Groups](#tool-groups). Don't copy it
here by hand; every number written in prose drifts on the next deploy.
`;
export const EN_FILES = `## Files

### List files
\`GET /files\`
Query: \`limit?\` (default 50), \`cursor?\`, \`assetId?\`
Returns: \`{ items: File[], nextCursor?: string }\`
SDK: \`eb.listFiles({ limit?, cursor?, assetId? })\`

### Upload file
\`POST /files\`
Body: \`{ fileName, contentType, size, access?: "public"|"private", region?: "LATAM"|"US"|"EU", assetId? }\`
Returns: \`{ file: File, putUrl: string }\`
Then \`PUT putUrl\` with raw bytes to upload.
SDK: \`eb.uploadFile({ fileName, contentType, size, access?, region? })\`

### Get file
\`GET /files/:fileId\`
Returns: File object with \`readUrl\` (presigned, expires 1h).
SDK: \`eb.getFile(fileId)\`

### Update file
\`PATCH /files/:fileId\`
Body: \`{ name?, access?: "public"|"private", metadata?, status?: "DONE" }\`
Changing access copies the object between public/private buckets.
SDK: \`eb.updateFile(fileId, { name?, access?, metadata? })\`

### Delete file
\`DELETE /files/:fileId\`
Soft-deletes (status → DELETED). Recoverable for 7 days.
SDK: \`eb.deleteFile(fileId)\`

### Restore file
\`POST /files/:fileId/restore\`
Restores a soft-deleted file back to DONE.
SDK: \`eb.restoreFile(fileId)\`

### List deleted files
\`GET /files?status=DELETED\`
Returns deleted files with \`daysUntilPurge\`.
SDK: \`eb.listDeletedFiles({ limit?, cursor? })\`

### Duplicate file
\`POST /files/:fileId/duplicate\`
Body: \`{ name? }\`
Creates a new storage copy + DB record.
SDK: \`eb.duplicateFile(fileId, name?)\`

### Search files (AI-powered)
\`GET /files/search?q=query\`
Requires an AI key configured. Returns up to 20 matches.
SDK: \`eb.searchFiles(query)\`

### File object
\`\`\`json
{
  "id": "abc123",
  "name": "photo.jpg",
  "contentType": "image/jpeg",
  "size": 204800,
  "status": "DONE",
  "access": "public",
  "url": "https://...",
  "readUrl": "https://... (presigned)",
  "metadata": {},
  "createdAt": "2026-01-15T...",
  "updatedAt": "2026-01-15T..."
}
\`\`\`
`;
export const EN_WEB = `## Web — Internet for your agents

Search Google, read any page even if it blocks bots (residential IPs, JS resolved), extract schema-based records from known sites and crawl a whole site. Available through REST, SDK and MCP (toolset \`web\`: \`web_search\`, \`web_fetch\`, \`web_extract\`, \`web_extract_status\`, \`web_crawl\`).

**Metered in queries, not credits.** 1 query = 1 page read, 1 search, 1 record extracted — and in a crawl, each page it reads (max 20 per call). You get 50 on sign-up; Web packs ($99 MXN → 400, $999 MXN → 10,000) are at \`/dash/packs?tab=web\`, work on any plan and **never expire**. No balance → \`402\` with \`{ error, code, requiredCost, available, buy }\` (\`buy\` is the absolute URL to purchase: hand it to the user).

**\`country\` is optional** and is 2 letters (ISO 3166-1): \`mx\` Mexico · \`us\` United States · \`es\` Spain · \`ar\` Argentina · \`co\` Colombia · \`cl\` Chile · \`pe\` Peru · \`br\` Brazil. Use it to see the site as a user from that country (prices in MXN, local stock, localized Google results). If you omit it, the provider chooses. In \`web_extract\` with \`google_maps\` it goes in UPPERCASE inside the input (\`country: "MX"\`).

### Search
\`POST /web/search\`
Body: \`{ query, engine?: "google"|"bing"|"yandex"|"duckduckgo", country? }\`
Returns: \`{ query, engine, results: { organic: [{ title, link, description }], … } }\` (organic, local businesses, knowledge panel)
1 query. Use it to find the right URL, then read it with \`/web/fetch\`.
SDK: \`eb.webSearch({ query, country? })\` · MCP: \`web_search({ query, country? })\`

\`\`\`bash
curl -X POST https://www.easybits.cloud/api/v2/web/search \\
  -H "Authorization: Bearer $EASYBITS_API_KEY" -H "Content-Type: application/json" \\
  -d '{"query":"ubiquiti u6 mesh precio","country":"mx"}'
\`\`\`

### Read a page
\`POST /web/fetch\`
Body: \`{ url, country?, asMarkdown?, onlyMainContent? }\`
Returns: \`{ url, statusCode, format: "html"|"markdown", body }\`
1 query. The body is truncated at 200 KB. \`asMarkdown: true\` returns markdown; \`onlyMainContent: true\` strips nav, footer, icons and "skip to content" — the usual choice when you are going to READ the page.
SDK: \`eb.webFetch({ url, asMarkdown, onlyMainContent })\` · MCP: \`web_fetch({ url, asMarkdown })\`

\`\`\`bash
curl -X POST https://www.easybits.cloud/api/v2/web/fetch \\
  -H "Authorization: Bearer $EASYBITS_API_KEY" -H "Content-Type: application/json" \\
  -d '{"url":"https://www.amazon.com.mx/dp/B09YRZYB29","country":"mx","asMarkdown":true,"onlyMainContent":true}'
\`\`\`

### Extract schema-based records
\`POST /web/extract\`
Body: \`{ source?, datasetId?, input, limit? }\`
- \`source\`: \`google_maps\` | \`mercadolibre\` | \`amazon_product\` | \`amazon_reviews\` | \`google_shopping\` | \`instagram_profiles\` | \`instagram_posts\` | \`tiktok_profiles\` | \`tiktok_posts\` | \`facebook_page_posts\` | \`facebook_marketplace\` | \`youtube_channels\` | \`youtube_videos\` | \`linkedin_company\` | \`linkedin_person\` | \`linkedin_jobs\` | \`indeed_jobs\` | \`trustpilot\` | \`inmuebles24\` | \`reddit_posts\`
- \`datasetId\`: for sources outside the list (catalog of 1,000+)
- \`input\`: \`google_maps\` → \`[{ keyword, country: "MX" }]\` · \`mercadolibre\` → \`{ query, page? }\` · everything else → \`[{ url }]\`
- \`limit\`: max records per input (default 20, max 200)
Returns: \`202 { jobId, status: "running", source }\`. \`mercadolibre\` responds instantly: \`200 { jobId, status: "done", records: [{ title, price, url, seller, … }], total }\`.
Charges 1 query PER RECORD returned, once, when you collect them. Firing the job costs nothing; a failed job is not charged.
SDK: \`eb.webExtract(...)\` / \`eb.webExtractAndWait(...)\` (polls every 15 s) · MCP: \`web_extract({ source, input, limit })\`

### Extract job status
\`GET /web/extract/:jobId\`
Returns: \`{ jobId, status: "running"|"done"|"error", records?, total? }\`
Free while it runs. Requesting an already-charged job again does not charge again. Schema-based jobs take 30-120 s: poll every ~15 s.
MCP: \`web_extract_status({ jobId })\` → \`{ status, items, total }\`

\`\`\`bash
curl -X POST https://www.easybits.cloud/api/v2/web/extract \\
  -H "Authorization: Bearer $EASYBITS_API_KEY" -H "Content-Type: application/json" \\
  -d '{"source":"google_maps","input":[{"keyword":"dentista Polanco CDMX","country":"MX"}],"limit":20}'
# → 202 { "jobId": "…", "status": "running" }
curl https://www.easybits.cloud/api/v2/web/extract/$JOB_ID -H "Authorization: Bearer $EASYBITS_API_KEY"
# → { "status": "done", "records": [ … ], "total": 20 }
\`\`\`

### Crawl a site
\`POST /web/crawl\`
Body: \`{ url, maxPages?, onlyMainContent?, country? }\`
Returns: \`{ startUrl, pages: [{ url, markdown }], pending: [ … ] }\`
Reads the start URL and follows its internal links (same domain) up to \`maxPages\` (1-20, default 10). 1 query per page actually read. \`pending\` are the links seen but not visited: pass one to another call to continue. \`onlyMainContent\` recommended for RAG.
MCP: \`web_crawl({ url, maxPages })\`

### Web-specific errors
- \`402\` no queries left → \`{ code, requiredCost, available, buy }\`
- \`429\` \`UPSTREAM_COOLDOWN\` (\`Retry-After: 60\`): the provider cooled down that query; it's temporary, retry later
- \`502\` provider error · \`503\` service not configured
`;
export const EN_DATABASES = `## Databases (SQLite-as-a-Service)

Create isolated SQLite databases for your agents and apps. Powered by sqld (libsql-server).

### List databases
\`GET /databases\`
Returns: \`{ items: Database[] }\`
SDK: \`eb.listDatabases()\`
MCP: \`db_list\`

### Create database
\`POST /databases\`
Body: \`{ name: string, description?: string }\`
Name must be alphanumeric/dashes/underscores, max 64 chars. Limit depends on plan (Byte: 3, Mega: 10, Tera: 20).
Returns: Database object.
SDK: \`eb.createDatabase({ name, description? })\`
MCP: \`db_create({ name, description? })\`

### Get database
\`GET /databases/:dbId\`
SDK: \`eb.getDatabase(dbId)\`
MCP: \`db_get({ dbId })\`

### Delete database
\`DELETE /databases/:dbId\`
Permanently deletes the database and all its data.
SDK: \`eb.deleteDatabase(dbId)\`
MCP: \`db_delete({ dbId })\`

### Query database
\`POST /databases/:dbId/query\`
Body: \`{ sql: string, args?: any[] }\`
Returns: \`{ cols: string[], rows: any[][], affected_row_count: number, last_insert_rowid: string|null }\`
SDK: \`eb.db(name).query(sql, args?)\`
MCP: \`db_query({ dbId, sql, args? })\`

### Batch execute
\`POST /databases/:dbId/query\`
Body: \`{ statements: [{ sql, args? }] }\` (max 20)
Returns: \`{ results: Result[] }\`
MCP: \`db_exec({ dbId, statements })\`

### Bulk import
\`POST /databases/:dbId/query\`
Body: \`{ table: string, columns: string[], rows: any[][], onConflict?: "ignore" | "replace" }\`
Up to 10,000 rows per request. Column/table names must be alphanumeric + underscores.
Returns: \`{ imported: number, total: number }\`
MCP: \`db_import({ dbId, table, columns, rows, onConflict? })\`

### Errors

Query errors come as \`{ "error": "…", "code": "<code>" }\`:

| Status | \`code\` | What happened | What to do |
|---|---|---|---|
| 400 | \`SQL_ERROR\` | The statement failed (syntax, missing table, constraint); \`error\` carries SQLite's message | Fix the SQL |
| 409 | \`DATABASE_STORAGE_MISSING\` | The database exists in your account but its storage is missing on the server; its data is not available | Delete it and create a new one, or contact support |
| 502 | \`DATABASE_BACKEND_ERROR\` | The database backend failed | Retry in a moment |
| 404 | — | The database does not exist or is not yours | Check the id with \`GET /databases\` |

### Database object
\`\`\`json
{
  "id": "db123",
  "name": "my-app-db",
  "namespace": "db123",
  "description": "App data store",
  "createdAt": "2026-03-15T...",
  "updatedAt": "2026-03-15T..."
}
\`\`\`

### Webhook events
- \`database.created\` — new database created
- \`database.deleted\` — database deleted

### Limits
- Max databases per plan: Byte 3, Mega 10, Tera 20
- Name: alphanumeric, dashes, underscores, max 64 chars
- Batch: max 20 statements per request
`;
export const EN_ERRORS = `## Error Codes

| Status | Meaning |
|--------|---------|
| 400 | Bad request — invalid params or body |
| 401 | Unauthorized — missing or invalid API key |
| 403 | Forbidden — insufficient scope or not your resource |
| 404 | Not found — resource doesn't exist |
| 409 | Conflict — duplicate or state conflict |
| 413 | File too large (max 5 GB) |
| 429 | Rate limited — too many requests |
| 500 | Server error |

Error response format:
\`\`\`json
{ "error": "Human-readable message" }
\`\`\`
`;
