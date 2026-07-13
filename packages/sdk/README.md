# @easybits.cloud/sdk

Agentic-first file storage SDK — the typed HTTP client for AI agents to manage, share, and transform files.

EasyBits is the platform where AI agents store, manage, and consume digital assets via SDK, MCP, and REST API.

## Install

```bash
npm install @easybits.cloud/sdk
```

## Quick Start

```ts
import { EasybitsClient } from "@easybits.cloud/sdk";

const eb = new EasybitsClient({ apiKey: "eb_sk_live_..." });

// Upload a file
const { file, putUrl } = await eb.uploadFile({
  fileName: "photo.jpg",
  contentType: "image/jpeg",
  size: 1024000,
});

// Upload bytes to the presigned URL
await fetch(putUrl, { method: "PUT", body: fileBuffer });

// Confirm upload
await eb.updateFile(file.id, { status: "DONE" });
```

## Authentication

Get your API key from the [Developer Dashboard](https://www.easybits.cloud/dash/developer).

```ts
const eb = new EasybitsClient({ apiKey: process.env.EASYBITS_API_KEY! });
```

Or use automatic resolution from `~/.easybitsrc` or env vars:

```ts
import { createClientFromEnv } from "@easybits.cloud/sdk";
const eb = await createClientFromEnv();
```

## Methods

### Files

| Method | Description |
|--------|-------------|
| `listFiles(params?)` | List your files (paginated) |
| `getFile(fileId)` | Get file details + download URL |
| `uploadFile(params)` | Create file record + get upload URL |
| `updateFile(fileId, params)` | Update name, access, metadata, or status |
| `deleteFile(fileId)` | Soft-delete a file (7-day retention) |
| `restoreFile(fileId)` | Restore a soft-deleted file |
| `listDeletedFiles(params?)` | List deleted files with days until purge |
| `searchFiles(query)` | AI-powered natural language file search |
| `bulkUploadFiles(items)` | Create up to 20 file records + upload URLs |
| `bulkDeleteFiles(fileIds)` | Soft-delete up to 100 files at once |
| `duplicateFile(fileId, name?)` | Copy an existing file (new storage object) |
| `listPermissions(fileId)` | List sharing permissions for a file |

### Images

| Method | Description |
|--------|-------------|
| `optimizeImage(params)` | Convert to WebP/AVIF (creates new file) |
| `transformImage(params)` | Resize, crop, rotate, flip, grayscale |

### Sharing

| Method | Description |
|--------|-------------|
| `shareFile(params)` | Share a file with another user by email |
| `generateShareToken(fileId, expiresIn?)` | Generate a temporary download URL |
| `listShareTokens(params?)` | List share tokens (paginated) |

### Webhooks

| Method | Description |
|--------|-------------|
| `listWebhooks()` | List your configured webhooks |
| `createWebhook(params)` | Create a webhook (returns secret, shown once) |
| `getWebhook(webhookId)` | Get webhook details |
| `updateWebhook(webhookId, params)` | Update URL, events, or status |
| `deleteWebhook(webhookId)` | Permanently delete a webhook |

### Websites

| Method | Description |
|--------|-------------|
| `listWebsites()` | List your static websites |
| `createWebsite(name)` | Create a new website |
| `getWebsite(websiteId)` | Get website details |
| `updateWebsite(websiteId, params)` | Update website name/status |
| `deleteWebsite(websiteId)` | Delete website and its files |

### Workspaces

Namespaced, quota-bounded containers of files. Create one per tenant, mint a workspace-scoped key, and that key can only ever touch its own workspace's files.

| Method | Description |
|--------|-------------|
| `listWorkspaces(params?)` | List workspaces (cursor paginated) |
| `createWorkspace({ name, slug?, quotaBytes? })` | Create a workspace |
| `getWorkspace(workspaceId)` | Get workspace details |
| `updateWorkspace(workspaceId, params)` | Update name/status/quota |
| `deleteWorkspace(workspaceId)` | Delete workspace and its files |
| `getWorkspaceUsage(workspaceId)` | Get `{ usedBytes, quotaBytes, fileCount }` |
| `createWorkspaceKey(workspaceId, params?)` | Mint a workspace-scoped API key (raw returned once) |

### Documents

| Method | Description |
|--------|-------------|
| `listDocuments()` | List your documents |
| `getDocument(id)` | Get document with all pages |
| `createDocument(params)` | Create a document |
| `updateDocument(id, params)` | Update document metadata (name, theme, colors) |
| `deleteDocument(id)` | Delete a document |
| `deployDocument(id)` | Publish as live website |
| `unpublishDocument(id)` | Unpublish document |
| `generateDocument(id, params)` | AI-generate pages (parallel, streaming) |
| `refineDocument(id, params)` | Surgical AI edits to a page |
| `regenerateDocumentPage(id, params)` | Redesign a page keeping content |
| `enhanceDocumentPrompt(name, prompt?)` | Auto-describe or enhance a prompt |
| `getDocumentDirections(prompt, opts?)` | Get 4 design directions (fonts, colors, mood) |

### Account

| Method | Description |
|--------|-------------|
| `getUsageStats()` | Storage used/limit, file counts, plan info |
| `listProviders()` | List storage providers |
| `listKeys()` | List your API keys |

## Webhooks

EasyBits sends POST requests to your URL when events occur. Payloads are signed with HMAC SHA-256.

```ts
// Create a webhook
const webhook = await eb.createWebhook({
  url: "https://your-server.com/webhooks/easybits",
  events: ["file.created", "file.deleted"],
});

// Save the secret — it's only shown once
console.log(webhook.secret); // whsec_...
```

### Events

| Event | Trigger |
|-------|---------|
| `file.created` | File uploaded or duplicated |
| `file.updated` | File name, access, or metadata changed |
| `file.deleted` | File soft-deleted |
| `file.restored` | File restored from trash |
| `website.created` | Website created |
| `website.deleted` | Website deleted |
| `workspace.created` | Workspace created |
| `workspace.deleted` | Workspace deleted |

### Verifying signatures

```ts
import { createHmac } from "crypto";

function verifyWebhook(body: string, signature: string, secret: string): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  return signature === expected;
}

// In your webhook handler:
const signature = req.headers["x-easybits-signature"];
const event = req.headers["x-easybits-event"];
const isValid = verifyWebhook(rawBody, signature, webhook.secret);
```

### Payload format

```json
{
  "event": "file.created",
  "timestamp": "2026-02-26T12:00:00.000Z",
  "data": {
    "id": "abc123",
    "name": "photo.jpg",
    "size": 1024000,
    "contentType": "image/jpeg",
    "access": "private"
  }
}
```

### Auto-pause

Webhooks are automatically paused after 5 consecutive delivery failures. Reactivate with:

```ts
await eb.updateWebhook(webhookId, { status: "ACTIVE" });
```

## Examples

### Bulk upload files

```ts
const { items } = await eb.bulkUploadFiles([
  { fileName: "a.pdf", contentType: "application/pdf", size: 50000 },
  { fileName: "b.png", contentType: "image/png", size: 120000 },
]);

for (const { file, putUrl } of items) {
  await fetch(putUrl, { method: "PUT", body: buffers[file.name] });
  await eb.updateFile(file.id, { status: "DONE" });
}
```

### Check account usage

```ts
const stats = await eb.getUsageStats();
console.log(`${stats.storage.usedGB}/${stats.storage.maxGB} GB used`);
console.log(`${stats.counts.files} files, ${stats.counts.webhooks} webhooks`);
```

### Duplicate a file

```ts
const copy = await eb.duplicateFile("abc123", "photo-backup.jpg");
```

## Pagination

Every paginated list returns one envelope: `{ items, nextCursor, hasMore }` (some
also include `total`). When `hasMore` is `true`, pass `nextCursor` back as `cursor`
to fetch the next page:

```ts
let cursor: string | undefined;
do {
  const { items, nextCursor, hasMore } = await eb.listFiles({ limit: 50, cursor });
  process(items);
  cursor = nextCursor ?? undefined;
  if (!hasMore) break;
} while (cursor);
```

## Error Handling

All errors share one shape: a JSON body `{ "error": "message" }`, sometimes with
extra fields like `code` or `status`.

```ts
import { EasybitsError } from "@easybits.cloud/sdk";

try {
  await eb.getFile("nonexistent");
} catch (err) {
  if (err instanceof EasybitsError) {
    console.log(err.status); // 404
    console.log(err.body);   // '{"error":"File not found"}'
  }
}
```

## Sandboxes

Run code in isolated Firecracker microVMs — execute code with a persistent
Jupyter kernel, manage files, run background processes, and expose ports as
public HTTPS URLs.

```ts
import { EasybitsClient } from "@easybits.cloud/sdk";

const eb = new EasybitsClient({ apiKey: process.env.EASYBITS_API_KEY });

// Create a sandbox (waits until it's running)
const sbx = await eb.sandboxes.create({ template: "code-interpreter" });

// Persistent Python kernel — state survives between calls
await sbx.runCell("import pandas as pd; df = pd.read_csv('sales.csv')");
const out = await sbx.runCell("df.groupby('month').total.sum()");
console.log(out.stdout);

// matplotlib charts come back as image/png in results[]
const chart = await sbx.runCell("df.plot(); plt.show()");
const png = chart.results.find((r) => r.type === "image/png")?.data; // base64

// Run a server and get a public URL
await sbx.execBackground("python3 -m http.server 3000");
const { url } = await sbx.exposePort(3000);
console.log(url); // https://sb-...-3000.sandboxes.easybits.cloud

// Files
await sbx.files.write("/tmp/data.json", JSON.stringify({ ok: true }));
const { content } = await sbx.files.read("/tmp/data.json");

// Lifecycle
await sbx.extend(600);   // add 10 min to the TTL
await sbx.destroy();
```

### Snapshot & fork (copy-on-write clone)

Freeze a **running** box into a named image, then boot **N children** from it —
each an independent sandbox with its own IP. Prep the environment once (deps
installed, project set up), snapshot it, and fork in parallel to try N variants
without repeating the setup.

```ts
// Base box: install deps once
const base = await eb.sandboxes.create({ template: "node" });
await base.exec("npm i -g cowsay");

// Snapshot the ready state — the box keeps running
const snap = await base.snapshot("deps-ready");

// Fork into 3 children that run in parallel (each inherits the disk)
const kids = await base.fork({ count: 3 });
for (const k of kids) {
  await k.waitUntilReady();
  console.log(k.sandboxId, (await k.exec("cowsay hi")).stdout);
}

// Reuse the snapshot later, without the base box
const more = await eb.sandboxes.forkFromSnapshot(snap.snapshotId, { count: 2 });

// Catalog + cleanup
await eb.sandboxes.snapshots.list();
await eb.sandboxes.snapshots.delete(snap.snapshotId);
```

Templates: `code-interpreter` (Python + Jupyter kernel + numpy/pandas/matplotlib),
`ubuntu`, `node`, `bun`, and more. Use `eb.listTemplates()` for the catalog.
For one-off snippets without persistent state, use `sbx.runCode(code, { lang })`.

## Fleet Agents

Elastic fleet agents route conversations to ephemeral workers (WhatsApp, WABA,
web). Create/list/delete authenticate with the client credential (a user OAuth JWT
with `WRITE` scope); **every config and message call takes the per-agent `token`
returned by `create()`** — persist `{ id, token }` and reuse the token as the
second argument. One client instance can configure many agents.

```ts
// Lifecycle — auth = client credential (pass the user JWT as apiKey)
const eb = new EasybitsClient({ apiKey: userJwt });
const { fleetAgent } = await eb.fleet.create({ name: "Tania", systemPrompt: "...", model: "claude-sonnet-5" });
const { id, token } = fleetAgent;              // persist BOTH

// Pick a non-default engine (DeepSeek/Codex/…). Some engines need a provider
// secret — set it right after with setSecret (e.g. DEEPSEEK_API_KEY).
const ds = await eb.fleet.create({ engine: "deepseek", name: "Vendedor", systemPrompt: "..." });
await eb.fleet.setSecret(ds.fleetAgent.id, ds.fleetAgent.token, { name: "DEEPSEEK_API_KEY", value: "sk-..." });
await eb.fleet.list();                          // { pools: [...] }
await eb.fleet.delete(id);

// Read config — auth = per-agent token
const caps = await eb.fleet.getCapabilities(id, token);
caps.agent.model;      // "claude-sonnet-5"
caps.agent.effort;     // "medium"
caps.skills;           // [{ id, name, enabled, ... }]

// Agent-level config
await eb.fleet.setName(id, token, "Tania");
await eb.fleet.setAgentPrompt(id, token, "New base instructions...");
await eb.fleet.setModel(id, token, "claude-opus-4-8");
await eb.fleet.setEffort(id, token, "high");           // low|medium|high|xhigh|max
await eb.fleet.toggleOwnNumber(id, token, true);
await eb.fleet.addMcp(id, token, { name: "stripe", pkg: "@stripe/mcp", requiredSecret: "STRIPE_KEY" });
await eb.fleet.toggleSkill(id, token, { skillId: "abc", on: true });

// Per-channel config (groupId; "*" = the agent's default)
await eb.fleet.setGroupPrompt(id, token, "*", "Extra per-channel instructions");
await eb.fleet.setToolGroup(id, token, "*", { buckets: ["documentos", "db", "db-write"] });
await eb.fleet.setCapLevel(id, token, "*", { cap: "denik", level: "write" });

// Messaging
const { reply } = await eb.fleet.message(id, token, { groupId: "web-123", text: "Hola" });
```

`getCapabilities` returns the full catalog + current state (builtins, capabilities,
buckets, `bucketTools`, models, skills, per-group config). See the type
`FleetCapabilities` for the shape.

## MCP Integration

For **AI agents**, the same sandboxes are available as MCP tools (the agent calls
them itself — no code needed):

```bash
npx -y @easybits.cloud/mcp
```

## License

MIT
