# @easybits.cloud/sdk

Official TypeScript SDK for the [EasyBits](https://www.easybits.cloud) API — file storage with AI superpowers.

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

### Websites

| Method | Description |
|--------|-------------|
| `listWebsites()` | List your static websites |
| `createWebsite(name)` | Create a new website |
| `getWebsite(websiteId)` | Get website details |
| `updateWebsite(websiteId, params)` | Update website name/status |
| `deleteWebsite(websiteId)` | Delete website and its files |

### Config

| Method | Description |
|--------|-------------|
| `listProviders()` | List storage providers |
| `listKeys()` | List your API keys |

## Examples

### List and filter files

```ts
const { items, nextCursor } = await eb.listFiles({ limit: 10 });
```

### Transform an image

```ts
const result = await eb.transformImage({
  fileId: "abc123",
  width: 800,
  height: 600,
  fit: "cover",
  format: "webp",
  quality: 85,
});
```

### Generate a temporary share link

```ts
const { url } = await eb.generateShareToken("abc123", 3600); // 1 hour
```

### Search files with natural language

```ts
const { items } = await eb.searchFiles("all PDF files uploaded recently");
```

### Deploy a static website

```ts
const { website } = await eb.createWebsite("my-docs");
// Upload files with the website prefix, then:
await eb.updateWebsite(website.id, { status: "DEPLOYED" });
// Access at: https://my-docs.easybits.cloud
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

EasyBits also provides an MCP server for AI agents:

```bash
npx -y @easybits.cloud/mcp
```

## License

MIT
