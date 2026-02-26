import { Link } from "react-router";
import type { Route } from "./+types/docs";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { useState, useEffect } from "react";
import { CodeBlock } from "~/components/mdx/CodeBlock";

export const meta = () => [
  ...getBasicMetaTags({
    title: "EasyBits API Docs — Agentic-First File Storage",
    description: "Complete API reference for the EasyBits REST API v2. 30+ endpoints for AI agents to manage files, webhooks, and storage.",
  }),
  { tagName: "link", rel: "canonical", href: "https://www.easybits.cloud/docs" },
];

const SECTIONS = [
  { id: "quickstart", label: "Quick Start" },
  { id: "auth", label: "Authentication" },
  { id: "sdk", label: "SDK" },
  { id: "files", label: "Files" },
  { id: "bulk", label: "Bulk Operations" },
  { id: "images", label: "Images" },
  { id: "sharing", label: "Sharing" },
  { id: "webhooks", label: "Webhooks" },
  { id: "websites", label: "Websites" },
  { id: "account", label: "Account & Usage" },
  { id: "errors", label: "Errors & Rate Limits" },
] as const;

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "");
      if (SECTIONS.some((s) => s.id === hash)) return hash;
    }
    return "quickstart";
  });

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash && SECTIONS.some((s) => s.id === hash)) {
      setActiveSection(hash);
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  return (
    <section className="min-h-screen bg-white">
      {/* JSON-LD: WebAPI + SoftwareApplication for LLM/search discovery */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebAPI",
                name: "EasyBits API",
                description: "Agentic-first file storage REST API. 30+ endpoints for AI agents to manage, share, and transform files.",
                url: "https://www.easybits.cloud/docs",
                documentation: "https://www.easybits.cloud/docs",
                provider: {
                  "@type": "Organization",
                  name: "EasyBits",
                  url: "https://www.easybits.cloud",
                },
                termsOfService: "https://www.easybits.cloud/terminos-y-condiciones",
                category: ["File Storage", "AI Agent Tools", "MCP Server"],
              },
              {
                "@type": "SoftwareApplication",
                name: "@easybits.cloud/sdk",
                applicationCategory: "DeveloperApplication",
                operatingSystem: "Node.js, Bun, Deno",
                description: "Typed SDK for AI agents to manage files via the EasyBits API v2. Includes webhooks, bulk operations, image transforms, and static site hosting.",
                url: "https://www.npmjs.com/package/@easybits.cloud/sdk",
                offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
                provider: {
                  "@type": "Organization",
                  name: "EasyBits",
                  url: "https://www.easybits.cloud",
                },
              },
              {
                "@type": "SoftwareApplication",
                name: "@easybits.cloud/mcp",
                applicationCategory: "DeveloperApplication",
                description: "MCP server with 30+ tools for AI agents to store, manage, and consume files. Works with Claude, ChatGPT, and any MCP-compatible client.",
                url: "https://www.npmjs.com/package/@easybits.cloud/mcp",
                offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
                provider: {
                  "@type": "Organization",
                  name: "EasyBits",
                  url: "https://www.easybits.cloud",
                },
              },
              {
                "@type": "TechArticle",
                headline: "EasyBits API Documentation",
                description: "Complete API reference for the EasyBits REST API v2. Files, webhooks, websites, bulk operations, image transforms, and SDK.",
                url: "https://www.easybits.cloud/docs",
                author: { "@type": "Organization", name: "EasyBits" },
                about: [
                  { "@type": "Thing", name: "File Storage API" },
                  { "@type": "Thing", name: "MCP Server" },
                  { "@type": "Thing", name: "AI Agent Tools" },
                ],
              },
            ],
          }),
        }}
      />

      {/* Nav */}
      <nav className="border-b-2 border-black px-6 py-4 sticky top-0 bg-white z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/inicio" className="font-bold text-xl">
            EasyBits
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/developers" className="text-sm font-medium hover:underline">
              For Developers
            </Link>
            <Link to="/status" className="text-sm font-medium hover:underline">
              Status
            </Link>
            <Link
              to="/login"
              className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold border-2 border-black"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto flex">
        {/* Sidebar */}
        <aside className="hidden md:block w-56 shrink-0 border-r-2 border-black sticky top-[57px] overflow-y-auto max-h-[calc(100vh-57px)] p-4">
          <h2 className="font-bold text-xs uppercase text-gray-500 mb-3">
            API Reference
          </h2>
          <nav className="space-y-1">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setActiveSection(s.id)}
                className={`block px-3 py-1.5 rounded-lg text-sm ${
                  activeSection === s.id
                    ? "bg-black text-white font-bold"
                    : "hover:bg-gray-100"
                }`}
              >
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 px-6 md:px-12 py-10 max-w-4xl">
          {/* Quick Start */}
          <section id="quickstart" className="mb-16">
            <h1 className="text-3xl font-bold mb-2">API Documentation</h1>
            <p className="text-gray-500 mb-4 text-sm">Agentic-first file storage for AI agents and developers</p>
            <p className="text-gray-600 mb-4">
              Base URL: <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-sm">https://www.easybits.cloud/api/v2</code>
            </p>
            <div className="mb-6 bg-blue-50 border-2 border-blue-300 rounded-xl p-4 text-sm">
              <strong>3 ways to integrate:</strong> REST API (below), <a href="#sdk" className="underline font-medium">typed SDK</a> ({`npm i @easybits.cloud/sdk`}), or{" "}
              <a href="https://www.npmjs.com/package/@easybits.cloud/mcp" className="underline font-medium" target="_blank" rel="noreferrer">MCP server</a> (30+ tools for AI agents).
            </div>

            <h2 className="text-xl font-bold mb-4">Quick Start</h2>
            <ol className="list-decimal list-inside space-y-3 text-gray-700 mb-6">
              <li>Create an account at <Link to="/login" className="underline font-medium">easybits.cloud</Link></li>
              <li>Go to <Link to="/dash/developer" className="underline font-medium">Developer Dashboard</Link> and create an API key</li>
              <li>Make your first request:</li>
            </ol>
            <TabbedCode
              tabs={[
                { label: "curl", code: `curl -H "Authorization: Bearer eb_sk_live_YOUR_KEY" \\
  https://www.easybits.cloud/api/v2/files` },
                { label: "SDK", code: `import { EasybitsClient } from "@easybits.cloud/sdk";

const eb = new EasybitsClient({ apiKey: "eb_sk_live_YOUR_KEY" });
const { items } = await eb.listFiles();` },
              ]}
            />
          </section>

          {/* Authentication */}
          <section id="auth" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Authentication</h2>
            <p className="text-gray-600 mb-4">
              All API requests require a Bearer token in the Authorization header.
            </p>
            <TabbedCode
              tabs={[
                { label: "Header", code: `Authorization: Bearer eb_sk_live_YOUR_API_KEY` },
                { label: "SDK", code: `import { EasybitsClient } from "@easybits.cloud/sdk";

// Explicit
const eb = new EasybitsClient({ apiKey: "eb_sk_live_..." });

// From env (EASYBITS_API_KEY) or ~/.easybitsrc
import { createClientFromEnv } from "@easybits.cloud/sdk";
const eb = await createClientFromEnv();` },
              ]}
            />
            <div className="mt-4 bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 text-sm">
              <strong>Scopes:</strong> API keys can have READ, WRITE, DELETE, or ADMIN scopes.
              Operations require the appropriate scope.
            </div>
          </section>

          {/* SDK */}
          <section id="sdk" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">SDK</h2>
            <p className="text-gray-600 mb-4 text-sm">
              The typed SDK wraps the entire REST API. Install and use it in any Node.js/Bun/Deno project.
            </p>
            <CodeExample title="Install" code="npm install @easybits.cloud/sdk" />

            <h3 className="text-lg font-bold mt-8 mb-4">All Methods</h3>

            <SdkMethodTable title="Files" methods={[
              ["listFiles(params?)", "List files (paginated)"],
              ["getFile(fileId)", "Get file + download URL"],
              ["uploadFile(params)", "Create file + get upload URL"],
              ["updateFile(fileId, params)", "Update name, access, metadata, status"],
              ["deleteFile(fileId)", "Soft-delete (7-day retention)"],
              ["restoreFile(fileId)", "Restore from trash"],
              ["listDeletedFiles(params?)", "List trash with days until purge"],
              ["searchFiles(query)", "AI-powered natural language search"],
              ["duplicateFile(fileId, name?)", "Copy file (new storage object)"],
              ["listPermissions(fileId)", "List sharing permissions"],
            ]} />

            <SdkMethodTable title="Bulk Operations" methods={[
              ["bulkUploadFiles(items)", "Upload up to 20 files at once"],
              ["bulkDeleteFiles(fileIds)", "Delete up to 100 files at once"],
            ]} />

            <SdkMethodTable title="Images" methods={[
              ["optimizeImage(params)", "Convert to WebP/AVIF"],
              ["transformImage(params)", "Resize, rotate, flip, convert, grayscale"],
            ]} />

            <SdkMethodTable title="Sharing" methods={[
              ["shareFile(params)", "Share with another user by email"],
              ["generateShareToken(fileId, expiresIn?)", "Temporary download URL"],
              ["listShareTokens(params?)", "List tokens (paginated)"],
            ]} />

            <SdkMethodTable title="Webhooks" methods={[
              ["listWebhooks()", "List configured webhooks"],
              ["createWebhook(params)", "Create webhook (returns secret once)"],
              ["getWebhook(webhookId)", "Get webhook details"],
              ["updateWebhook(webhookId, params)", "Update URL, events, or status"],
              ["deleteWebhook(webhookId)", "Delete permanently"],
            ]} />

            <SdkMethodTable title="Websites" methods={[
              ["listWebsites()", "List static websites"],
              ["createWebsite(name)", "Create website, get id + URL"],
              ["getWebsite(websiteId)", "Get website details"],
              ["updateWebsite(websiteId, params)", "Update name/status"],
              ["deleteWebsite(websiteId)", "Delete website + files"],
            ]} />
            <p className="text-xs text-gray-500 -mt-4 mb-6">
              Deploy files by uploading with <code className="bg-gray-100 px-1 rounded">fileName: "sites/&#123;websiteId&#125;/path"</code> — see <a href="#websites" className="underline">Websites section</a> for full example.
            </p>

            <SdkMethodTable title="Account" methods={[
              ["getUsageStats()", "Storage, file counts, plan info"],
              ["listProviders()", "Storage providers"],
              ["listKeys()", "API keys"],
            ]} />

            <h3 className="text-lg font-bold mt-8 mb-4">Error Handling</h3>
            <CodeExample title="SDK" code={`import { EasybitsError } from "@easybits.cloud/sdk";

try {
  await eb.getFile("nonexistent");
} catch (err) {
  if (err instanceof EasybitsError) {
    console.log(err.status); // 404
    console.log(err.body);   // '{"error":"File not found"}'
  }
}`} />
          </section>

          {/* Files */}
          <section id="files" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Files</h2>

            <Endpoint
              method="GET"
              path="/files"
              description="List your files (paginated)"
              params={[
                { name: "assetId", type: "string", desc: "Filter by asset ID" },
                { name: "limit", type: "number", desc: "Max results (default 50, max 100)" },
                { name: "cursor", type: "string", desc: "Pagination cursor" },
                { name: "status", type: "string", desc: "Set to 'DELETED' to list deleted files" },
              ]}
              response={`{ "items": [...], "nextCursor": "..." }`}
              sdk={`const { items, nextCursor } = await eb.listFiles({ limit: 10 });`}
            />

            <Endpoint
              method="GET"
              path="/files/:fileId"
              description="Get file details with a temporary download URL"
              response={`{ "id": "...", "name": "photo.jpg", "readUrl": "https://..." }`}
              sdk={`const file = await eb.getFile("file_id");
console.log(file.readUrl); // presigned URL (1h)`}
            />

            <Endpoint
              method="POST"
              path="/files"
              description="Create a file record and get a presigned upload URL"
              body={[
                { name: "fileName", type: "string", desc: "Required" },
                { name: "contentType", type: "string", desc: "MIME type (required)" },
                { name: "size", type: "number", desc: "File size in bytes (required, 1B–5GB)" },
                { name: "access", type: "string", desc: "'public' or 'private' (default)" },
                { name: "region", type: "string", desc: "'LATAM', 'US', or 'EU'" },
              ]}
              response={`{ "file": {...}, "putUrl": "https://..." }`}
              note="Upload bytes via PUT to putUrl, then PATCH the file status to 'DONE'."
              sdk={`const { file, putUrl } = await eb.uploadFile({
  fileName: "photo.jpg",
  contentType: "image/jpeg",
  size: 1024000,
});
await fetch(putUrl, { method: "PUT", body: buffer });
await eb.updateFile(file.id, { status: "DONE" });`}
            />

            <Endpoint
              method="PATCH"
              path="/files/:fileId"
              description="Update file name, access level, metadata, or status"
              body={[
                { name: "name", type: "string", desc: "New file name" },
                { name: "access", type: "string", desc: "'public' or 'private'" },
                { name: "metadata", type: "object", desc: "Key-value pairs (merged, max 10KB)" },
                { name: "status", type: "string", desc: "Only 'DONE' (from PENDING)" },
              ]}
              sdk={`await eb.updateFile("file_id", {
  name: "renamed.jpg",
  access: "public",
  metadata: { tag: "avatar" },
});`}
            />

            <Endpoint
              method="DELETE"
              path="/files/:fileId"
              description="Soft-delete a file (7-day retention)"
              response={`{ "success": true }`}
              sdk={`await eb.deleteFile("file_id");`}
            />

            <Endpoint
              method="POST"
              path="/files/:fileId/restore"
              description="Restore a soft-deleted file"
              response={`{ "success": true }`}
              sdk={`await eb.restoreFile("file_id");`}
            />

            <Endpoint
              method="GET"
              path="/files/search?q=..."
              description="AI-powered natural language file search (requires AI key)"
              params={[{ name: "q", type: "string", desc: "Natural language query (required)" }]}
              response={`{ "items": [...] }`}
              sdk={`const { items } = await eb.searchFiles("all PDF invoices");`}
            />

            <Endpoint
              method="POST"
              path="/files/:fileId/duplicate"
              description="Create a copy of an existing file (new storage object)"
              body={[
                { name: "name", type: "string", desc: "Name for the copy (optional, defaults to 'Copy of ...')" },
              ]}
              response={`{ "id": "...", "name": "Copy of photo.jpg", ... }`}
              sdk={`const copy = await eb.duplicateFile("file_id", "backup.jpg");`}
            />

            <Endpoint
              method="GET"
              path="/files/:fileId/permissions"
              description="List sharing permissions for a file"
              response={`{ "items": [{ "email": "...", "canRead": true, "canWrite": false, ... }] }`}
              sdk={`const { items } = await eb.listPermissions("file_id");`}
            />
          </section>

          {/* Bulk Operations */}
          <section id="bulk" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Bulk Operations</h2>

            <Endpoint
              method="POST"
              path="/files/bulk-upload"
              description="Create multiple file records and get presigned upload URLs (max 20)"
              body={[
                { name: "items", type: "array", desc: "Array of { fileName, contentType, size, access? }" },
              ]}
              response={`{ "items": [{ "file": {...}, "putUrl": "https://..." }, ...] }`}
              note="Each file must be uploaded via PUT to its putUrl, then status set to DONE."
              sdk={`const { items } = await eb.bulkUploadFiles([
  { fileName: "a.pdf", contentType: "application/pdf", size: 50000 },
  { fileName: "b.png", contentType: "image/png", size: 120000 },
]);
for (const { file, putUrl } of items) {
  await fetch(putUrl, { method: "PUT", body: buffers[file.name] });
  await eb.updateFile(file.id, { status: "DONE" });
}`}
            />

            <Endpoint
              method="POST"
              path="/files/bulk-delete"
              description="Soft-delete multiple files at once (max 100)"
              body={[
                { name: "fileIds", type: "string[]", desc: "Array of file IDs to delete" },
              ]}
              response={`{ "deleted": 5, "ids": ["...", "..."] }`}
              sdk={`const result = await eb.bulkDeleteFiles(["id1", "id2", "id3"]);
console.log(result.deleted); // 3`}
            />
          </section>

          {/* Images */}
          <section id="images" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Images</h2>

            <Endpoint
              method="POST"
              path="/files/:fileId/optimize"
              description="Convert image to WebP or AVIF (creates a new file)"
              body={[
                { name: "format", type: "string", desc: "'webp' (default) or 'avif'" },
                { name: "quality", type: "number", desc: "1–100 (default: 80 webp, 50 avif)" },
              ]}
              response={`{ "file": {...}, "originalSize": 1024000, "optimizedSize": 256000, "savings": "75%" }`}
              sdk={`const result = await eb.optimizeImage({
  fileId: "file_id",
  format: "webp",
  quality: 80,
});
console.log(result.savings); // "75%"`}
            />

            <Endpoint
              method="POST"
              path="/files/:fileId/transform"
              description="Resize, crop, rotate, flip, or convert an image (creates a new file)"
              body={[
                { name: "width", type: "number", desc: "Target width in px" },
                { name: "height", type: "number", desc: "Target height in px" },
                { name: "fit", type: "string", desc: "'cover', 'contain', 'fill', 'inside', 'outside'" },
                { name: "format", type: "string", desc: "'webp', 'avif', 'png', 'jpeg'" },
                { name: "quality", type: "number", desc: "1–100" },
                { name: "rotate", type: "number", desc: "Degrees" },
                { name: "flip", type: "boolean", desc: "Vertical flip" },
                { name: "grayscale", type: "boolean", desc: "Convert to grayscale" },
              ]}
              response={`{ "file": {...}, "originalSize": ..., "transformedSize": ..., "transforms": [...] }`}
              sdk={`const result = await eb.transformImage({
  fileId: "file_id",
  width: 800,
  height: 600,
  fit: "cover",
  format: "webp",
});`}
            />
          </section>

          {/* Sharing */}
          <section id="sharing" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Sharing</h2>

            <Endpoint
              method="POST"
              path="/files/:fileId/share"
              description="Share a file with another user by email"
              body={[
                { name: "targetEmail", type: "string", desc: "Recipient email (required)" },
                { name: "canRead", type: "boolean", desc: "Default: true" },
                { name: "canWrite", type: "boolean", desc: "Default: false" },
                { name: "canDelete", type: "boolean", desc: "Default: false" },
              ]}
              sdk={`await eb.shareFile({
  fileId: "file_id",
  targetEmail: "coworker@example.com",
  canWrite: true,
});`}
            />

            <Endpoint
              method="POST"
              path="/files/:fileId/share-token"
              description="Generate a temporary download URL"
              body={[
                { name: "expiresIn", type: "number", desc: "Seconds (60–604800, default 3600)" },
              ]}
              response={`{ "url": "https://...", "token": { "id": "...", "expiresAt": "..." } }`}
              sdk={`const { url } = await eb.generateShareToken("file_id", 3600);
// url is a presigned download link valid for 1 hour`}
            />

            <Endpoint
              method="GET"
              path="/share-tokens"
              description="List share tokens (paginated)"
              params={[
                { name: "fileId", type: "string", desc: "Filter by file" },
                { name: "limit", type: "number", desc: "Max results" },
                { name: "cursor", type: "string", desc: "Pagination cursor" },
              ]}
              sdk={`const { items } = await eb.listShareTokens({ fileId: "file_id" });`}
            />
          </section>

          {/* Webhooks */}
          <section id="webhooks" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Webhooks</h2>
            <p className="text-gray-600 mb-4 text-sm">
              Receive real-time POST notifications when events occur. Payloads are signed with HMAC SHA-256 via the{" "}
              <code className="bg-gray-100 px-1 rounded">X-Easybits-Signature</code> header. Webhooks auto-pause after 5 consecutive delivery failures.
            </p>

            <div className="mb-6 bg-gray-50 border-2 border-gray-300 rounded-xl p-4 text-sm">
              <strong>Events:</strong>{" "}
              <code>file.created</code>, <code>file.updated</code>, <code>file.deleted</code>, <code>file.restored</code>, <code>website.created</code>, <code>website.deleted</code>
            </div>

            <Endpoint
              method="GET"
              path="/webhooks"
              description="List your configured webhooks"
              response={`{ "items": [{ "id": "...", "url": "https://...", "events": [...], "status": "ACTIVE" }] }`}
              sdk={`const { items } = await eb.listWebhooks();`}
            />

            <Endpoint
              method="POST"
              path="/webhooks"
              description="Create a webhook. The secret is only returned on creation — save it."
              body={[
                { name: "url", type: "string", desc: "HTTPS URL to receive POST notifications (required)" },
                { name: "events", type: "string[]", desc: "Events to subscribe to (required)" },
              ]}
              response={`{ "id": "...", "url": "...", "events": [...], "secret": "whsec_...", "status": "ACTIVE" }`}
              note="Max 10 webhooks per account. URL must use HTTPS."
              sdk={`const webhook = await eb.createWebhook({
  url: "https://your-server.com/hooks/easybits",
  events: ["file.created", "file.deleted"],
});
console.log(webhook.secret); // save this — shown only once`}
            />

            <Endpoint
              method="GET"
              path="/webhooks/:webhookId"
              description="Get webhook details (excluding secret)"
              sdk={`const webhook = await eb.getWebhook("webhook_id");`}
            />

            <Endpoint
              method="PATCH"
              path="/webhooks/:webhookId"
              description="Update webhook URL, events, or status"
              body={[
                { name: "url", type: "string", desc: "New HTTPS URL" },
                { name: "events", type: "string[]", desc: "New events list" },
                { name: "status", type: "string", desc: "'ACTIVE' or 'PAUSED'. Reactivating resets fail counter." },
              ]}
              sdk={`// Reactivate a paused webhook
await eb.updateWebhook("webhook_id", { status: "ACTIVE" });`}
            />

            <Endpoint
              method="DELETE"
              path="/webhooks/:webhookId"
              description="Permanently delete a webhook"
              response={`{ "success": true }`}
              sdk={`await eb.deleteWebhook("webhook_id");`}
            />

            <h3 className="text-lg font-bold mt-8 mb-4">Verifying Signatures</h3>
            <CodeExample
              title="Node.js"
              code={`import { createHmac } from "crypto";

function verifyWebhook(body, signature, secret) {
  const expected = \`sha256=\${createHmac("sha256", secret)
    .update(body).digest("hex")}\`;
  return signature === expected;
}

// In your handler:
const sig = req.headers["x-easybits-signature"];
const valid = verifyWebhook(rawBody, sig, "whsec_...");`}
            />

            <h3 className="text-lg font-bold mt-8 mb-4">Payload Format</h3>
            <CodeExample
              title="JSON"
              code={`{
  "event": "file.created",
  "timestamp": "2026-02-26T12:00:00.000Z",
  "data": {
    "id": "abc123",
    "name": "photo.jpg",
    "size": 1024000,
    "contentType": "image/jpeg",
    "access": "private"
  }
}`}
            />
          </section>

          {/* Websites */}
          <section id="websites" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Websites</h2>

            <div className="mb-6 bg-green-50 border-2 border-green-300 rounded-xl p-4 text-sm space-y-2">
              <strong>How website deploys work:</strong>
              <ol className="list-decimal list-inside space-y-1 text-gray-700">
                <li>Create a website — you get an <code className="bg-gray-100 px-1 rounded">id</code> and a URL like <code className="bg-gray-100 px-1 rounded">https://my-site.easybits.cloud</code></li>
                <li>Upload files with <code className="bg-gray-100 px-1 rounded">fileName</code> set to <code className="bg-gray-100 px-1 rounded">{`sites/{websiteId}/path`}</code> (e.g. <code className="bg-gray-100 px-1 rounded">{`sites/{id}/index.html`}</code>)</li>
                <li>PUT the bytes to each <code className="bg-gray-100 px-1 rounded">putUrl</code>, then set status to DONE</li>
                <li>Your site is live — SPA fallback to <code className="bg-gray-100 px-1 rounded">index.html</code> is built-in</li>
              </ol>
            </div>

            <h3 className="text-lg font-bold mb-4">Deploy Example</h3>
            <CodeExample
              title="SDK"
              code={`// 1. Create website
const { website } = await eb.createWebsite("my-docs");

// 2. Upload files with the website prefix
const files = [
  { path: "index.html", content: htmlBuffer, type: "text/html" },
  { path: "style.css", content: cssBuffer, type: "text/css" },
  { path: "app.js", content: jsBuffer, type: "application/javascript" },
];

for (const f of files) {
  const { file, putUrl } = await eb.uploadFile({
    fileName: \`sites/\${website.id}/\${f.path}\`,
    contentType: f.type,
    size: f.content.byteLength,
  });
  await fetch(putUrl, { method: "PUT", body: f.content });
  await eb.updateFile(file.id, { status: "DONE" });
}

// 3. Live at: https://my-docs.easybits.cloud`}
            />

            <h3 className="text-lg font-bold mt-8 mb-4">Endpoints</h3>

            <Endpoint
              method="GET"
              path="/websites"
              description="List your static websites"
              sdk={`const { items } = await eb.listWebsites();`}
            />
            <Endpoint
              method="POST"
              path="/websites"
              description="Create a new website"
              body={[{ name: "name", type: "string", desc: "Website name (required)" }]}
              response={`{ "website": { "id": "...", "slug": "my-site", "url": "https://my-site.easybits.cloud" } }`}
              sdk={`const { website } = await eb.createWebsite("my-docs");
console.log(website.url); // https://my-docs.easybits.cloud`}
            />
            <Endpoint
              method="GET"
              path="/websites/:websiteId"
              description="Get website details"
              sdk={`const site = await eb.getWebsite("website_id");`}
            />
            <Endpoint
              method="PATCH"
              path="/websites/:websiteId"
              description="Update website name or status"
              body={[
                { name: "name", type: "string", desc: "New name" },
                { name: "status", type: "string", desc: "e.g. 'DEPLOYED'" },
              ]}
              sdk={`await eb.updateWebsite("website_id", { name: "new-name" });`}
            />
            <Endpoint
              method="DELETE"
              path="/websites/:websiteId"
              description="Delete website and soft-delete all its files"
              sdk={`await eb.deleteWebsite("website_id");`}
            />
          </section>

          {/* Account & Usage */}
          <section id="account" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Account & Usage</h2>

            <Endpoint
              method="GET"
              path="/usage"
              description="Get account usage statistics: storage, file counts, plan info"
              response={`{ "plan": "Spark", "storage": { "usedGB": 0.5, "maxGB": 1, "percentUsed": 50 }, "counts": { "files": 42, "webhooks": 2 } }`}
              sdk={`const stats = await eb.getUsageStats();
console.log(\`\${stats.storage.usedGB}/\${stats.storage.maxGB} GB\`);`}
            />

            <Endpoint
              method="GET"
              path="/providers"
              description="List your configured storage providers"
              response={`{ "providers": [...], "defaultProvider": { "type": "TIGRIS" } }`}
              sdk={`const { providers } = await eb.listProviders();`}
            />

            <Endpoint
              method="GET"
              path="/keys"
              description="List your API keys (session auth only)"
              sdk={`const { keys } = await eb.listKeys();`}
            />
          </section>

          {/* Errors */}
          <section id="errors" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Errors & Rate Limits</h2>
            <div className="space-y-4 text-sm">
              <div className="border-2 border-black rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-gray-100 border-b-2 border-black">
                    <tr>
                      <th className="px-4 py-2 font-bold">Status</th>
                      <th className="px-4 py-2 font-bold">Meaning</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    <tr><td className="px-4 py-2 font-mono">400</td><td className="px-4 py-2">Bad request (invalid params)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">401</td><td className="px-4 py-2">Unauthorized (missing/invalid API key)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">403</td><td className="px-4 py-2">Forbidden (insufficient scope)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">404</td><td className="px-4 py-2">Resource not found</td></tr>
                    <tr><td className="px-4 py-2 font-mono">429</td><td className="px-4 py-2">Rate limited (too many requests)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">500</td><td className="px-4 py-2">Server error</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="text-gray-600">
                All error responses include a JSON body: <code className="bg-gray-100 px-1 rounded">{`{"error": "message"}`}</code>
              </p>
              <p className="text-gray-600">
                Rate limits vary by plan. Free tier: 100 requests/minute. Pro: 1,000/minute. Business: 10,000/minute.
              </p>
            </div>
          </section>
        </main>
      </div>
    </section>
  );
}

// ─── Components ──────────────────────────────────────────────────

const LANG_MAP: Record<string, string> = {
  curl: "bash",
  sdk: "typescript",
  header: "http",
  "node.js": "javascript",
  json: "json",
  install: "bash",
};

function TabbedCode({ tabs }: { tabs: { label: string; code: string }[] }) {
  const [active, setActive] = useState(0);
  return (
    <div className="border-2 border-black rounded-xl overflow-hidden">
      <div className="flex bg-gray-800">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setActive(i)}
            className={`px-4 py-1.5 text-xs font-bold uppercase transition-colors ${
              active === i
                ? "bg-gray-950 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <CodeBlock bare language={LANG_MAP[tabs[active].label.toLowerCase()] || "typescript"}>
        {tabs[active].code}
      </CodeBlock>
    </div>
  );
}

function CodeExample({ title, code }: { title: string; code: string }) {
  const lang = LANG_MAP[title.toLowerCase()] || "typescript";
  return (
    <div className="border-2 border-black rounded-xl overflow-hidden">
      <div className="flex items-center justify-between bg-gray-800 px-4 py-2">
        <span className="text-white font-medium text-sm">{title}</span>
        <span className="text-gray-400 text-xs uppercase font-mono">{lang}</span>
      </div>
      <CodeBlock bare language={lang}>
        {code}
      </CodeBlock>
    </div>
  );
}

interface ParamDef {
  name: string;
  type: string;
  desc: string;
}

function Endpoint({
  method,
  path,
  description,
  params,
  body,
  response,
  note,
  sdk,
}: {
  method: string;
  path: string;
  description: string;
  params?: ParamDef[];
  body?: ParamDef[];
  response?: string;
  note?: string;
  sdk?: string;
}) {
  const methodColors: Record<string, string> = {
    GET: "bg-green-200 text-green-900",
    POST: "bg-blue-200 text-blue-900",
    PATCH: "bg-yellow-200 text-yellow-900",
    DELETE: "bg-red-200 text-red-900",
  };

  return (
    <div className="mb-8 border-2 border-black rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${methodColors[method] || "bg-gray-200"}`}>
          {method}
        </span>
        <code className="font-mono text-sm font-bold">{path}</code>
      </div>
      <div className="p-4">
        <p className="text-gray-700 text-sm mb-3">{description}</p>
        {params && <ParamTable title="Query Parameters" items={params} />}
        {body && <ParamTable title="Request Body (JSON)" items={body} />}
        {response && (
          <div className="mt-3">
            <span className="text-xs font-bold text-gray-500 uppercase">Response</span>
            <div className="mt-1 rounded-lg overflow-hidden">
              <CodeBlock bare language="json">{response}</CodeBlock>
            </div>
          </div>
        )}
        {sdk && (
          <div className="mt-3">
            <span className="text-xs font-bold text-purple-600 uppercase">SDK</span>
            <div className="mt-1 rounded-lg overflow-hidden">
              <CodeBlock bare language="typescript">{sdk}</CodeBlock>
            </div>
          </div>
        )}
        {note && (
          <p className="mt-3 text-xs text-gray-500 bg-yellow-50 border border-yellow-200 rounded-lg p-2">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}

function ParamTable({ title, items }: { title: string; items: ParamDef[] }) {
  return (
    <div className="mt-3">
      <span className="text-xs font-bold text-gray-500 uppercase">{title}</span>
      <table className="w-full mt-1 text-sm">
        <tbody className="divide-y divide-gray-100">
          {items.map((p) => (
            <tr key={p.name}>
              <td className="py-1 pr-4 font-mono text-xs font-bold w-32">{p.name}</td>
              <td className="py-1 pr-4 text-gray-500 text-xs w-20">{p.type}</td>
              <td className="py-1 text-gray-600 text-xs">{p.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SdkMethodTable({ title, methods }: { title: string; methods: [string, string][] }) {
  return (
    <div className="mb-6">
      <h4 className="text-sm font-bold text-gray-700 mb-2">{title}</h4>
      <div className="border-2 border-black rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 font-bold text-xs uppercase text-gray-500">Method</th>
              <th className="text-left px-4 py-2 font-bold text-xs uppercase text-gray-500">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {methods.map(([method, desc]) => (
              <tr key={method}>
                <td className="px-4 py-1.5 font-mono text-xs text-purple-700 font-medium">{method}</td>
                <td className="px-4 py-1.5 text-xs text-gray-600">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
