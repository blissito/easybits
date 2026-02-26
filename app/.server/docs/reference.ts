// EasyBits API Reference — returned by get_docs MCP tool and GET /api/v2/docs

const SECTIONS: Record<string, string> = {
  quickstart: `## Quick Start

**Base URL:** \`https://easybits.cloud/api/v2\`

**Authentication:** All requests require a Bearer token:
\`\`\`
Authorization: Bearer eb_sk_live_...
\`\`\`

Get your API key from the [Developer Dashboard](https://easybits.cloud/dash/developer).

**SDK Install:**
\`\`\`bash
npm install @easybits.cloud/sdk
\`\`\`

\`\`\`ts
import { EasybitsClient } from "@easybits.cloud/sdk";
const eb = new EasybitsClient({ apiKey: "eb_sk_live_..." });
\`\`\`

**MCP Server:**
\`\`\`bash
npx -y @easybits.cloud/mcp
\`\`\`
Configure with \`EASYBITS_API_KEY\` env var or \`~/.easybitsrc\`.
`,

  files: `## Files

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
`,

  bulk: `## Bulk Operations

### Bulk upload
\`POST /files/bulk-upload\`
Body: \`{ items: [{ fileName, contentType, size, access? }] }\` (max 20)
Returns: \`{ items: [{ file, putUrl }] }\`
SDK: \`eb.bulkUploadFiles(items)\`

### Bulk delete
\`POST /files/bulk-delete\`
Body: \`{ fileIds: string[] }\` (max 100)
Returns: \`{ deleted: number }\`
SDK: \`eb.bulkDeleteFiles(fileIds)\`
`,

  images: `## Images

### Optimize image
\`POST /files/:fileId/optimize\`
Body: \`{ format?: "webp"|"avif", quality?: 1-100 }\`
Defaults: quality 80 (WebP), 50 (AVIF). Creates a new file (original unchanged).
Returns: \`{ file, originalSize, optimizedSize, savings }\`
SDK: \`eb.optimizeImage({ fileId, format?, quality? })\`

### Transform image
\`POST /files/:fileId/transform\`
Body: \`{ width?, height?, fit?, format?, quality?, rotate?, flip?, grayscale? }\`
fit: "cover"|"contain"|"fill"|"inside"|"outside"
format: "webp"|"avif"|"png"|"jpeg"
Creates a new file (original unchanged).
Returns: \`{ file, originalSize, transformedSize, transforms }\`
SDK: \`eb.transformImage({ fileId, width?, height?, ... })\`
`,

  sharing: `## Sharing

### Share file with user
\`POST /files/:fileId/share\`
Body: \`{ targetEmail, canRead?: true, canWrite?: false, canDelete?: false }\`
Target user must exist on EasyBits.
SDK: \`eb.shareFile({ fileId, targetEmail, canRead?, canWrite?, canDelete? })\`

### Generate share token (presigned URL)
\`POST /files/:fileId/share-token\`
Body: \`{ expiresIn?: seconds }\` (default 3600, min 60, max 604800)
Returns: \`{ url, token }\`
SDK: \`eb.generateShareToken(fileId, expiresIn?)\`

### List share tokens
\`GET /share-tokens?fileId=&limit=&cursor=\`
Returns: \`{ items: ShareToken[] }\` with \`expired\` boolean.
SDK: \`eb.listShareTokens({ fileId?, limit?, cursor? })\`

### List permissions
\`GET /files/:fileId/permissions\`
Returns: \`{ items: Permission[] }\`
SDK: \`eb.listPermissions(fileId)\`
`,

  webhooks: `## Webhooks

### List webhooks
\`GET /webhooks\`
Returns: \`{ items: Webhook[] }\`
SDK: \`eb.listWebhooks()\`

### Create webhook
\`POST /webhooks\`
Body: \`{ url: string, events: string[] }\`
Returns webhook with \`secret\` (shown only once). Save it for signature verification.
SDK: \`eb.createWebhook({ url, events })\`

### Get webhook
\`GET /webhooks/:webhookId\`
SDK: \`eb.getWebhook(webhookId)\`

### Update webhook
\`PATCH /webhooks/:webhookId\`
Body: \`{ url?, events?, status?: "ACTIVE"|"PAUSED" }\`
Reactivating resets the fail counter.
SDK: \`eb.updateWebhook(webhookId, { url?, events?, status? })\`

### Delete webhook
\`DELETE /webhooks/:webhookId\`
SDK: \`eb.deleteWebhook(webhookId)\`

### Events
- \`file.created\` — new file uploaded
- \`file.updated\` — file name, access, or metadata changed
- \`file.deleted\` — file soft-deleted
- \`file.restored\` — file restored from trash
- \`website.created\` — new website created
- \`website.deleted\` — website deleted

### Payload format
\`\`\`json
{
  "event": "file.created",
  "timestamp": "2026-01-15T12:00:00Z",
  "data": { /* file or website object */ }
}
\`\`\`

### Signature verification
Each request includes \`X-Easybits-Signature: sha256=<hex>\`.
Verify with HMAC-SHA256 using the webhook secret:
\`\`\`ts
import { createHmac } from "crypto";
const expected = createHmac("sha256", secret)
  .update(rawBody)
  .digest("hex");
const signature = request.headers["x-easybits-signature"];
const isValid = signature === \`sha256=\${expected}\`;
\`\`\`

### Auto-pause
Webhooks auto-pause after 5 consecutive delivery failures (non-2xx response or timeout). Reactivate by updating status to "ACTIVE".
`,

  websites: `## Websites (Static Site Hosting)

### Deploy flow
1. Create a website: \`POST /websites\` → get \`websiteId\`
2. Upload files with \`assetId\` set to the websiteId (must include an \`index.html\`)
3. Site is live at \`https://easybits.cloud/s/<slug>/\`

### List websites
\`GET /websites\`
Returns: \`{ items: Website[] }\`
SDK: \`eb.listWebsites()\`

### Create website
\`POST /websites\`
Body: \`{ name: string }\`
Returns: \`{ website }\` with id, slug, url.
SDK: \`eb.createWebsite(name)\`

### Get website
\`GET /websites/:websiteId\`
Returns: Website with stats (fileCount, totalSize).
SDK: \`eb.getWebsite(websiteId)\`

### Update website
\`PATCH /websites/:websiteId\`
Body: \`{ name?, status? }\`
SDK: \`eb.updateWebsite(websiteId, { name?, status? })\`

### Delete website
\`DELETE /websites/:websiteId\`
Soft-deletes all associated files (recoverable 7 days).
SDK: \`eb.deleteWebsite(websiteId)\`

### Website object
\`\`\`json
{
  "id": "web123",
  "name": "My Site",
  "slug": "my-site",
  "status": "ACTIVE",
  "url": "https://easybits.cloud/s/my-site/",
  "fileCount": 3,
  "totalSize": 51200,
  "createdAt": "2026-01-15T..."
}
\`\`\`
`,

  account: `## Account & Usage

### Get usage stats
\`GET /usage\`
Returns: plan info, storage used/max, file/website/webhook counts.
SDK: \`eb.getUsageStats()\`

### List storage providers
\`GET /providers\`
Returns configured storage providers or platform default.
SDK: \`eb.listProviders()\`

### List API keys
\`GET /keys\`
SDK: \`eb.listKeys()\`

### Set AI key (for search)
Configure via MCP tool \`set_ai_key\` or dashboard. Supports ANTHROPIC and OPENAI providers.
`,

  sdk: `## SDK Method Reference

| Method | Description |
|--------|-------------|
| \`listFiles(params?)\` | List files with pagination |
| \`getFile(fileId)\` | Get file with download URL |
| \`uploadFile(params)\` | Create file + get upload URL |
| \`updateFile(fileId, params)\` | Update name, access, metadata |
| \`deleteFile(fileId)\` | Soft-delete a file |
| \`restoreFile(fileId)\` | Restore from trash |
| \`listDeletedFiles(params?)\` | List trashed files |
| \`duplicateFile(fileId, name?)\` | Copy a file |
| \`searchFiles(query)\` | AI-powered search |
| \`bulkUploadFiles(items)\` | Upload up to 20 files |
| \`bulkDeleteFiles(fileIds)\` | Delete up to 100 files |
| \`optimizeImage(params)\` | Convert to WebP/AVIF |
| \`transformImage(params)\` | Resize, rotate, flip, convert |
| \`shareFile(params)\` | Share with another user |
| \`generateShareToken(fileId, expiresIn?)\` | Create presigned URL |
| \`listShareTokens(params?)\` | List share tokens |
| \`listPermissions(fileId)\` | List file permissions |
| \`listWebsites()\` | List websites |
| \`createWebsite(name)\` | Create a website |
| \`getWebsite(websiteId)\` | Get website details |
| \`updateWebsite(websiteId, params)\` | Update website |
| \`deleteWebsite(websiteId)\` | Delete website + files |
| \`listWebhooks()\` | List webhooks |
| \`createWebhook(params)\` | Create webhook |
| \`getWebhook(webhookId)\` | Get webhook |
| \`updateWebhook(webhookId, params)\` | Update webhook |
| \`deleteWebhook(webhookId)\` | Delete webhook |
| \`getUsageStats()\` | Account usage stats |
| \`listProviders()\` | Storage providers |
| \`listKeys()\` | API keys |
| \`getDocs(section?)\` | Get this documentation |
`,

  errors: `## Error Codes

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
`,
};

const SECTION_KEYS = Object.keys(SECTIONS);

const HEADER = `# EasyBits API Reference

> Agentic-first file storage. Store, manage, and consume files via SDK, MCP, and REST API.

Sections: ${SECTION_KEYS.join(", ")}

---

`;

export function getDocsMarkdown(section?: string): string {
  if (section) {
    const key = section.toLowerCase();
    const content = SECTIONS[key];
    if (!content) {
      return `Unknown section "${section}". Available sections: ${SECTION_KEYS.join(", ")}`;
    }
    return content;
  }
  return HEADER + Object.values(SECTIONS).join("\n---\n\n");
}

export const VALID_SECTIONS = SECTION_KEYS;
