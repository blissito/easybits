import { Link, data } from "react-router";
import type { Route } from "./+types/mcp-apps-demo";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { Footer } from "~/components/common/Footer";
import { filePreviewHtml, fileListHtml, fileUploadHtml } from "~/.server/mcp/apps/html";

const APPS_META = [
  {
    slug: "file-preview",
    name: "File Preview",
    description: "Vista previa inline de cualquier archivo: imagenes, video, audio, PDF.",
    tool: "get_file",
  },
  {
    slug: "file-list",
    name: "File Browser",
    description: "Lista interactiva de archivos con iconos, metadata y click para ver detalle.",
    tool: "list_files",
  },
  {
    slug: "file-upload",
    name: "File Upload",
    description: "Dropzone con drag & drop, progress bar y confirmacion de upload.",
    tool: "upload_file",
  },
];

function makeDemoHtml(template: string, demoScript: string): string {
  const idx = template.indexOf("<script");
  if (idx === -1) return template;
  const beforeScript = template.substring(0, idx);
  return beforeScript + "<script>" + demoScript + "<\/script>\n</body>\n</html>";
}

const FILE_PREVIEW_DEMO = `
function formatSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + " " + units[i];
}
function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function escapeHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function render(file) {
  const ct = file.contentType || "";
  const url = file.readUrl || "";
  const safeUrl = escapeHtml(url);
  const safeName = escapeHtml(file.name || "");
  let previewHtml = "";
  if (ct.startsWith("image/") && url) {
    previewHtml = '<div class="preview"><img src="' + safeUrl + '" alt="' + safeName + '"></div>';
  } else {
    previewHtml = '<div class="preview"><div class="icon-card">\\u{1F4C4}</div></div>';
  }
  const accessBadge = file.access ? '<span class="badge ' + (file.access === "public" ? "badge-public" : "badge-private") + '">' + escapeHtml(file.access) + '</span>' : "";
  document.getElementById("root").innerHTML =
    '<div class="card">' + previewHtml +
    '<div class="info"><div class="name">' + (safeName || "Untitled") + ' ' + accessBadge + '</div>' +
    '<div class="meta"><span>' + escapeHtml(ct) + '</span><span>' + formatSize(file.size) + '</span><span>' + formatDate(file.createdAt) + '</span></div></div>' +
    (url ? '<div class="actions"><a class="btn" href="' + safeUrl + '" target="_blank" rel="noopener">\\u2B07 Download</a></div>' : "") +
    '</div>';
}
render({
  name: "aurora-borealis.jpg",
  contentType: "image/jpeg",
  size: 2458000,
  access: "public",
  createdAt: "2026-02-15T10:30:00Z",
  readUrl: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=560"
});
`;

const FILE_LIST_DEMO = `
function formatSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + " " + units[i];
}
function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function getFileIcon(ct) {
  if (!ct) return "\\u{1F4C4}";
  if (ct.startsWith("image/")) return "\\u{1F5BC}";
  if (ct.startsWith("video/")) return "\\u{1F3AC}";
  if (ct.startsWith("audio/")) return "\\u{1F3B5}";
  if (ct.includes("pdf")) return "\\u{1F4D1}";
  if (ct.includes("text") || ct.includes("markdown")) return "\\u{1F4DD}";
  return "\\u{1F4C4}";
}
function escapeHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function render(data) {
  const items = data.items || [];
  const root = document.getElementById("root");
  let html = '<div class="header"><h2>Files</h2><span class="count">' + items.length + ' files</span></div>';
  html += '<div class="file-list">';
  for (const f of items) {
    const badge = f.access ? '<span class="badge ' + (f.access === "public" ? "badge-public" : "badge-private") + '">' + escapeHtml(f.access) + '</span>' : "";
    html += '<div class="file-row"><div class="file-icon">' + getFileIcon(f.contentType) + '</div><div class="file-info"><div class="file-name">' + escapeHtml(f.name) + '</div><div class="file-meta"><span>' + formatSize(f.size) + '</span><span>' + escapeHtml(f.contentType || "") + '</span><span>' + formatDate(f.createdAt) + '</span></div></div>' + badge + '</div>';
  }
  html += '</div>';
  root.innerHTML = html;
}
render({
  items: [
    { id: "f1", name: "aurora-borealis.jpg", contentType: "image/jpeg", size: 2458000, access: "public", createdAt: "2026-02-15T10:30:00Z" },
    { id: "f2", name: "quarterly-report.pdf", contentType: "application/pdf", size: 1024000, access: "private", createdAt: "2026-02-10T08:00:00Z" },
    { id: "f3", name: "podcast-ep12.mp3", contentType: "audio/mpeg", size: 8500000, access: "public", createdAt: "2026-01-28T14:20:00Z" },
    { id: "f4", name: "demo-video.mp4", contentType: "video/mp4", size: 15000000, access: "private", createdAt: "2026-01-15T09:45:00Z" },
    { id: "f5", name: "README.md", contentType: "text/markdown", size: 3200, access: "public", createdAt: "2026-01-05T11:00:00Z" }
  ],
  nextCursor: null
});
`;

const FILE_UPLOAD_DEMO = `
function formatSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + " " + units[i];
}
function escapeHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
const root = document.getElementById("root");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");

function showProgress(name, size) {
  root.innerHTML =
    '<div class="progress-container">' +
      '<div class="file-name">' + escapeHtml(name) + '</div>' +
      '<div class="file-meta">' + formatSize(size) + '</div>' +
      '<div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>' +
      '<div class="progress-text" id="progressText">Uploading...</div>' +
    '</div>';
}

function showSuccess(name, size) {
  root.innerHTML =
    '<div class="success">' +
      '<div class="success-icon">\\u2705</div>' +
      '<div class="success-name">' + escapeHtml(name) + '</div>' +
      '<div class="success-meta">' + formatSize(size) + ' uploaded</div>' +
      '<button class="btn-upload-more" onclick="location.reload()">Upload another</button>' +
    '</div>';
}

function handleFile(file) {
  showProgress(file.name, file.size);
  let pct = 0;
  const interval = setInterval(() => {
    pct += Math.random() * 15 + 5;
    if (pct >= 100) {
      pct = 100;
      clearInterval(interval);
      setTimeout(() => showSuccess(file.name, file.size), 300);
    }
    const fill = document.getElementById("progressFill");
    const text = document.getElementById("progressText");
    if (fill) fill.style.width = Math.round(pct) + "%";
    if (text) text.textContent = Math.round(pct) + "%";
  }, 200);
}

dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});
dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
`;

const DEMO_SCRIPTS: Record<string, string> = {
  "file-preview": FILE_PREVIEW_DEMO,
  "file-list": FILE_LIST_DEMO,
  "file-upload": FILE_UPLOAD_DEMO,
};

const HTML_TEMPLATES: Record<string, string> = {
  "file-preview": filePreviewHtml,
  "file-list": fileListHtml,
  "file-upload": fileUploadHtml,
};

const CONFIG_JSON: Record<string, object> = {
  "file-preview": {
    name: "EasyBitsFilePreview",
    version: "1.0.0",
    tools: ["get_file"],
    resourceUris: ["easybits://apps/file-preview"],
  },
  "file-list": {
    name: "EasyBitsFileList",
    version: "1.0.0",
    tools: ["list_files"],
    resourceUris: ["easybits://apps/file-list"],
  },
  "file-upload": {
    name: "EasyBitsFileUpload",
    version: "1.0.0",
    tools: ["upload_file"],
    resourceUris: ["easybits://apps/file-upload"],
  },
};

export const loader = ({ params }: Route.LoaderArgs) => {
  const { appName } = params;
  const app = APPS_META.find((a) => a.slug === appName);
  if (!app) {
    throw data("Not Found", { status: 404 });
  }
  const demoHtml = makeDemoHtml(HTML_TEMPLATES[app.slug], DEMO_SCRIPTS[app.slug]);
  return { app, demoHtml, configJson: JSON.stringify(CONFIG_JSON[app.slug], null, 2) };
};

export const meta = ({ data: loaderData }: Route.MetaArgs) => {
  const d = loaderData as any;
  if (!d?.app) return [];
  return getBasicMetaTags({
    title: `${d.app.name} — MCP Apps UI Demo | EasyBits`,
    description: d.app.description,
  });
};

export default function McpAppsDemo({ loaderData }: Route.ComponentProps) {
  const { app, demoHtml, configJson } = loaderData;

  return (
    <section className="overflow-hidden w-full min-h-screen flex flex-col bg-white">
      {/* Nav */}
      <nav className="border-b-2 border-black px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/inicio" className="font-bold text-xl">
            EasyBits
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/docs" className="text-sm font-medium hover:underline">
              Docs
            </Link>
            <Link to="/developers" className="text-sm font-medium hover:underline">
              Developers
            </Link>
            <Link
              to="/login"
              className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold border-2 border-black hover:translate-y-[-2px] transition-transform"
            >
              Iniciar sesion
            </Link>
          </div>
        </div>
      </nav>

      {/* Back link */}
      <div className="px-6 pt-6">
        <div className="max-w-6xl mx-auto">
          <Link to="/mcp/apps" className="text-sm font-medium text-gray-500 hover:text-black transition-colors">
            &larr; Todas las Apps
          </Link>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <div className="lg:w-80 shrink-0 space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-2xl font-bold">{app.name}</h1>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-amber-100 text-amber-700 rounded border border-amber-300">
                  Experimental
                </span>
              </div>
              <p className="text-gray-600">{app.description}</p>
            </div>

            <div className="border-2 border-black rounded-xl p-4 bg-gray-50">
              <h3 className="text-sm font-bold mb-2">Tool MCP</h3>
              <code className="text-sm font-mono bg-gray-200 px-2 py-1 rounded">{app.tool}</code>
            </div>

            <div className="border-2 border-black rounded-xl p-4 bg-gray-50">
              <h3 className="text-sm font-bold mb-2">Resource URI</h3>
              <code className="text-sm font-mono bg-gray-200 px-2 py-1 rounded break-all">
                easybits://apps/{app.slug}
              </code>
            </div>

            <div className="border-2 border-black rounded-xl overflow-hidden">
              <div className="bg-gray-900 px-4 py-2">
                <span className="text-xs text-gray-400 font-mono">App Config</span>
              </div>
              <div className="bg-gray-950 px-4 py-4">
                <pre className="text-xs text-green-400 font-mono whitespace-pre overflow-x-auto">
                  {configJson}
                </pre>
              </div>
            </div>

            <a
              href="https://github.com/AlejandroPBlanco/easybits/blob/main/app/.server/mcp/apps/html.ts"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm font-medium underline hover:no-underline"
            >
              Ver codigo fuente
            </a>
          </div>

          {/* Demo iframe */}
          <div className="flex-1 min-w-0">
            <div className="border-2 border-black rounded-xl overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <div className="bg-gray-100 border-b-2 border-black px-4 py-2 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400 border border-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400 border border-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-400 border border-green-500" />
                </div>
                <span className="text-xs text-gray-500 font-mono ml-2">Demo — {app.name}</span>
              </div>
              <iframe
                srcDoc={demoHtml}
                className="w-full border-none bg-[#0a0a0a]"
                style={{ minHeight: "480px" }}
                sandbox="allow-scripts"
                title={`${app.name} demo`}
              />
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </section>
  );
}
