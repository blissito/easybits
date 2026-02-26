# EasyBits MCP Server

Agentic-first file storage for AI agents. Connect your AI to [EasyBits](https://www.easybits.cloud) — upload files, manage webhooks, optimize images, deploy websites, and more — all through natural language.

## Quick Start

### 1. Get your API key

Sign up at [easybits.cloud](https://www.easybits.cloud) and generate an API key from your [developer dashboard](https://www.easybits.cloud/dash/developer).

### 2. Configure your client

#### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "easybits": {
      "command": "npx",
      "args": ["-y", "@easybits.cloud/mcp"],
      "env": {
        "EASYBITS_API_KEY": "your-api-key"
      }
    }
  }
}
```

#### Claude Code

```bash
claude mcp add easybits -- npx -y @easybits.cloud/mcp
```

Then set your API key in `~/.easybitsrc`:

```
EASYBITS_API_KEY=your-api-key
```

#### Cursor

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "easybits": {
      "command": "npx",
      "args": ["-y", "@easybits.cloud/mcp"],
      "env": {
        "EASYBITS_API_KEY": "your-api-key"
      }
    }
  }
}
```

### 3. Start using it

Ask your AI agent things like:

- *"Upload this PDF and make it public"*
- *"Show me my storage usage"*
- *"Optimize that PNG to WebP"*
- *"Set up a webhook for file uploads"*
- *"Bulk delete all my temp files"*
- *"Duplicate that config file"*

## Tools (31)

### Files

| Tool | Description |
|------|-------------|
| `list_files` | List files with pagination and filtering |
| `get_file` | Get file metadata and a signed download URL (1h expiry) |
| `upload_file` | Create a file record and get a presigned upload URL |
| `update_file` | Update name, access level, or metadata |
| `delete_file` | Soft-delete a file (recoverable for 7 days) |
| `restore_file` | Restore a soft-deleted file |
| `list_deleted_files` | List deleted files with days until permanent purge |
| `search_files` | AI-powered natural language file search (requires AI key) |
| `bulk_upload_files` | Create up to 20 file records with presigned upload URLs |
| `bulk_delete_files` | Soft-delete up to 100 files at once |
| `duplicate_file` | Copy an existing file (creates new storage object) |
| `list_permissions` | List sharing permissions for a file |

### Sharing

| Tool | Description |
|------|-------------|
| `share_file` | Share a file with another user by email |
| `generate_share_token` | Generate a presigned download URL (60s–7 days) |
| `list_share_tokens` | List all share tokens with expiration status |

### Images

| Tool | Description |
|------|-------------|
| `optimize_image` | Convert images to WebP or AVIF with quality control |
| `transform_image` | Resize, rotate, flip, convert format, or apply grayscale |

### Webhooks

| Tool | Description |
|------|-------------|
| `list_webhooks` | List your configured webhooks |
| `create_webhook` | Create a webhook for file/website events (returns secret) |
| `update_webhook` | Update URL, events, or status (ACTIVE/PAUSED) |
| `delete_webhook` | Permanently delete a webhook |

**Events**: `file.created`, `file.updated`, `file.deleted`, `file.restored`, `website.created`, `website.deleted`

Payloads are signed with HMAC SHA-256 via `X-Easybits-Signature` header. Webhooks auto-pause after 5 consecutive failures.

### Account

| Tool | Description |
|------|-------------|
| `get_usage_stats` | Storage used/limit, file counts, plan info |

### AI Configuration

| Tool | Description |
|------|-------------|
| `set_ai_key` | Store an AI provider API key (Anthropic/OpenAI) for search |
| `list_ai_keys` | List configured AI keys (masked) |
| `delete_ai_key` | Remove a stored AI key |

### Storage

| Tool | Description |
|------|-------------|
| `list_providers` | List configured storage providers |

### Websites

| Tool | Description |
|------|-------------|
| `list_websites` | List all websites with stats |
| `create_website` | Create a new website with auto-generated slug |
| `get_website` | Get website details and computed stats |
| `update_website` | Update website name or status |
| `delete_website` | Delete website and soft-delete associated files |

## Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `EASYBITS_API_KEY` | Your EasyBits API key | Yes |
| `EASYBITS_URL` | Custom API base URL | No |

You can also set these in a `~/.easybitsrc` file:

```
EASYBITS_API_KEY=eb_your_key_here
```

## SDK

For programmatic access, use the typed SDK:

```bash
npm install @easybits.cloud/sdk
```

```ts
import { EasybitsClient } from "@easybits.cloud/sdk";
const eb = new EasybitsClient({ apiKey: "eb_sk_live_..." });
```

## Transport

This package is a **stdio-to-HTTP proxy**. It reads JSON-RPC messages from stdin and forwards them to the EasyBits MCP endpoint (`https://www.easybits.cloud/api/mcp`). Responses are streamed back via Server-Sent Events (SSE).

## Requirements

- Node.js 18+
- An EasyBits account with an API key

## Links

- [EasyBits](https://www.easybits.cloud)
- [Dashboard](https://www.easybits.cloud/dash/developer)
- [Blog](https://www.easybits.cloud/blog)

## License

MIT
