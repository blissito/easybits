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

## Error Handling

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

## MCP Integration

EasyBits also provides an MCP server with 30+ tools for AI agents:

```bash
npx -y @easybits.cloud/mcp
```

## License

MIT
