import { Link } from "react-router";
import type { Route } from "./+types/docs";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { useState } from "react";

export const meta = () =>
  getBasicMetaTags({
    title: "EasyBits API Docs",
    description: "Complete API reference for the EasyBits REST API v2",
  });

const SECTIONS = [
  { id: "quickstart", label: "Quick Start" },
  { id: "auth", label: "Authentication" },
  { id: "files", label: "Files" },
  { id: "images", label: "Images" },
  { id: "sharing", label: "Sharing" },
  { id: "websites", label: "Websites" },
  { id: "config", label: "Config" },
  { id: "errors", label: "Errors & Rate Limits" },
] as const;

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("quickstart");

  return (
    <section className="min-h-screen bg-white">
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
        <aside className="hidden md:block w-56 shrink-0 border-r-2 border-black min-h-screen sticky top-[57px] self-start p-4">
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
        <main className="flex-1 px-6 md:px-12 py-10 max-w-4xl">
          {/* Quick Start */}
          <section id="quickstart" className="mb-16">
            <h1 className="text-3xl font-bold mb-4">API Documentation</h1>
            <p className="text-gray-600 mb-6">
              Base URL: <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-sm">https://www.easybits.cloud/api/v2</code>
            </p>

            <h2 className="text-xl font-bold mb-4">Quick Start</h2>
            <ol className="list-decimal list-inside space-y-3 text-gray-700 mb-6">
              <li>Create an account at <Link to="/login" className="underline font-medium">easybits.cloud</Link></li>
              <li>Go to <Link to="/dash/developer" className="underline font-medium">Developer Dashboard</Link> and create an API key</li>
              <li>Make your first request:</li>
            </ol>
            <CodeExample
              title="curl"
              code={`curl -H "Authorization: Bearer eb_sk_live_YOUR_KEY" \\
  https://www.easybits.cloud/api/v2/files`}
            />
            <div className="mt-4">
              <CodeExample
                title="SDK"
                code={`import { EasybitsClient } from "@easybits.cloud/sdk";

const eb = new EasybitsClient({ apiKey: "eb_sk_live_YOUR_KEY" });
const { items } = await eb.listFiles();`}
              />
            </div>
          </section>

          {/* Authentication */}
          <section id="auth" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Authentication</h2>
            <p className="text-gray-600 mb-4">
              All API requests require a Bearer token in the Authorization header.
            </p>
            <CodeExample
              title="Header"
              code={`Authorization: Bearer eb_sk_live_YOUR_API_KEY`}
            />
            <div className="mt-4 bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 text-sm">
              <strong>Scopes:</strong> API keys can have READ, WRITE, DELETE, or ADMIN scopes.
              Operations require the appropriate scope.
            </div>
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
            />

            <Endpoint
              method="GET"
              path="/files/:fileId"
              description="Get file details with a temporary download URL"
              response={`{ "id": "...", "name": "photo.jpg", "readUrl": "https://..." }`}
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
            />

            <Endpoint
              method="DELETE"
              path="/files/:fileId"
              description="Soft-delete a file (7-day retention)"
              response={`{ "success": true }`}
            />

            <Endpoint
              method="POST"
              path="/files/:fileId/restore"
              description="Restore a soft-deleted file"
              response={`{ "success": true }`}
            />

            <Endpoint
              method="GET"
              path="/files/search?q=..."
              description="AI-powered natural language file search (requires AI key)"
              params={[{ name: "q", type: "string", desc: "Natural language query (required)" }]}
              response={`{ "items": [...] }`}
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
            />

            <Endpoint
              method="POST"
              path="/files/:fileId/share-token"
              description="Generate a temporary download URL"
              body={[
                { name: "expiresIn", type: "number", desc: "Seconds (60–604800, default 3600)" },
              ]}
              response={`{ "url": "https://...", "token": { "id": "...", "expiresAt": "..." } }`}
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
            />
          </section>

          {/* Websites */}
          <section id="websites" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Websites</h2>

            <Endpoint method="GET" path="/websites" description="List your static websites" />
            <Endpoint
              method="POST"
              path="/websites"
              description="Create a new website"
              body={[{ name: "name", type: "string", desc: "Website name (required)" }]}
              response={`{ "website": { "id": "...", "slug": "my-site", "url": "https://my-site.easybits.cloud" } }`}
            />
            <Endpoint method="GET" path="/websites/:websiteId" description="Get website details" />
            <Endpoint
              method="PATCH"
              path="/websites/:websiteId"
              description="Update website name or status"
              body={[
                { name: "name", type: "string", desc: "New name" },
                { name: "status", type: "string", desc: "e.g. 'DEPLOYED'" },
              ]}
            />
            <Endpoint
              method="DELETE"
              path="/websites/:websiteId"
              description="Delete website and soft-delete all its files"
            />
          </section>

          {/* Config */}
          <section id="config" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Config</h2>

            <Endpoint
              method="GET"
              path="/providers"
              description="List your configured storage providers"
              response={`{ "providers": [...], "defaultProvider": { "type": "TIGRIS" } }`}
            />

            <Endpoint method="GET" path="/keys" description="List your API keys (session auth only)" />
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

function CodeExample({ title, code }: { title: string; code: string }) {
  return (
    <div className="border-2 border-black rounded-xl overflow-hidden">
      <div className="px-4 py-1.5 bg-gray-100 border-b-2 border-black text-xs font-bold uppercase text-gray-500">
        {title}
      </div>
      <pre className="p-4 bg-gray-950 text-gray-300 text-sm overflow-x-auto">
        <code>{code}</code>
      </pre>
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
}: {
  method: string;
  path: string;
  description: string;
  params?: ParamDef[];
  body?: ParamDef[];
  response?: string;
  note?: string;
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
            <pre className="mt-1 bg-gray-100 rounded-lg p-3 text-xs font-mono overflow-x-auto">
              {response}
            </pre>
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
