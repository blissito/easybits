# EasyBits MCP Server

The cloud for AI agents. Connect your AI to [EasyBits](https://www.easybits.cloud) — run code in an isolated microVM, search and read the web, store files, query SQL databases, generate documents and deploy apps — all through natural language.

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
claude mcp add easybits -e EASYBITS_API_KEY=your-api-key -- npx -y @easybits.cloud/mcp
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

## Tools

The proxy is a transport: every tool lives on the server, so the catalog grows
without republishing this package. That also means **this README does not list
the tools** — a hand-written list here rots on the next deploy. The live
catalog is:

- `https://www.easybits.cloud/api/tools.json` — machine-readable, derived from
  the MCP server itself (groups, counts and every tool).
- [The docs](https://www.easybits.cloud/docs) — the `tool-groups` and
  `all-mcp-tools` sections are generated from the same source.

### Toolsets (`--tools`)

There are far too many tools to load at once without flooding the model's
context, so the server registers only the groups you ask for. Pass `--tools`
with one group or several separated by commas:

```bash
# Default when you pass nothing: the core group
npx -y @easybits.cloud/mcp

# Core plus microVM sandboxes
npx -y @easybits.cloud/mcp --tools core,sandbox

# Everything, if your model can take it
npx -y @easybits.cloud/mcp --tools all
```

Groups include `core`, `web`, `sandbox`, `hosting`, `design`, `docs`, `sites`,
`video`, `payments`, `email` and `scripting`. `tools.json` above is the
authoritative list with what each one contains.

## Response & error contract

Every tool follows the same conventions, so an agent always parses the same shapes:

- **Success** returns the result as JSON text (and `structuredContent` when applicable).
- **Errors** return `isError: true` with a JSON body `{ "error": "message" }`, sometimes
  with extra fields like `code`, `status`, or `providerStatus`.
- **Lists** (`list_*`) all return one envelope:

  ```json
  { "items": [ ... ], "nextCursor": "abc" , "hasMore": true }
  ```

  Some lists also include `total`. When `hasMore` is `true`, pass `nextCursor` back as
  `cursor` (or as `offset` for `list_documents` / `list_websites`) to fetch the next page.
  When there are no more results, `nextCursor` is `null` and `hasMore` is `false`.

## Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `EASYBITS_API_KEY` | Your EasyBits API key | Yes |
| `EASYBITS_URL` | Custom API base URL | No |

The key can also be passed as `--key eb_sk_live_...`, or stored in a
`~/.easybitsrc` file, which is **JSON**:

```json
{ "apiKey": "eb_sk_live_your_key_here" }
```

`baseUrl` is accepted there too. Precedence for the key is `--key`, then
`EASYBITS_API_KEY`, then the rc file.

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

## Agent Workflows

EasyBits works great alongside other AI tools. Here are common patterns for agents that have access to both EasyBits and image generation tools (like fal.ai):

### Image generation → upload → share

```
1. Generate image with your image tool (fal.ai, DALL-E, etc.)
2. upload_file → get presigned URL → PUT the image bytes
3. Share via generate_share_token or set access to "public"
4. Send the URL to the user
```

### Image editing pipeline

```
1. User sends a photo → agent saves it locally
2. Edit with fal.ai tools (bg-remove, upscale, restyle, remove-object, inpaint)
3. upload_file the result to EasyBits for permanent storage
4. Return the EasyBits URL (persistent, unlike fal.ai temp URLs)
```

### Document with generated images

```
1. Generate images/graphics with image tools
2. upload_file each image to EasyBits
3. create_document with HTML sections that reference the uploaded image URLs
4. Share the document link
```

### Website with dynamic assets

```
1. Generate or edit images as needed
2. upload_website_file for each asset
3. set_page_html to build pages referencing those assets
4. Deploy — user gets a live URL
```

### Why use EasyBits for agent-generated files?

- **Persistent URLs** — fal.ai and other generation APIs return temporary URLs that expire. EasyBits URLs are permanent.
- **Access control** — set files as private, public, or share with specific users via tokens.
- **Organization** — search, tag, and manage all generated assets in one place.
- **Webhooks** — trigger downstream workflows when files are created or updated.

## Links

- [EasyBits](https://www.easybits.cloud)
- [Dashboard](https://www.easybits.cloud/dash/developer)
- [Blog](https://www.easybits.cloud/blog)

## License

MIT
