import { Link } from "react-router";
import type { Route } from "./+types/mcp-apps";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { Footer } from "~/components/common/Footer";
import { filePreviewHtml, fileListHtml, fileUploadHtml } from "~/.server/mcp/apps/html";

export const meta = () =>
  getBasicMetaTags({
    title: "MCP Apps UI — EasyBits",
    description:
      "Demos interactivos de MCP Apps UI: preview de archivos, browser y upload inline. EasyBits es early adopter de la spec que trae interfaces visuales a los clientes MCP.",
  });

export const APPS_META = [
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
  let html = beforeScript + "<script>" + demoScript + "<\/script>\n</body>\n</html>";
  // Fix unicode escapes → real emojis
  html = html.replace(/\\u\{2B06\}/g, '⬆').replace(/\\u\{2705\}/g, '✅')
    .replace(/\\u\{1F4C4\}/g, '📄').replace(/\\u\{1F5BC\}/g, '🖼')
    .replace(/\\u\{1F3AC\}/g, '🎬').replace(/\\u\{1F3B5\}/g, '🎵')
    .replace(/\\u\{1F4D1\}/g, '📑').replace(/\\u\{1F4E6\}/g, '📦')
    .replace(/\\u\{1F4DD\}/g, '📝').replace(/\\u2B07/g, '⬇');
  // Center container
  html = html.replace('.container { max-width: 480px;', '.container { max-width: 480px; margin: 0 auto;');
  html = html.replace('.container { max-width: 640px;', '.container { max-width: 640px; margin: 0 auto;');
  // Translate static HTML text to Spanish
  html = html.replace('Drop a file', 'Suelta un archivo');
  html = html.replace('or click to browse', 'o haz clic para buscar');
  html = html.replace('Loading file preview...', 'Cargando vista previa...');
  html = html.replace('Loading files...', 'Cargando archivos...');
  return html;
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
    (url ? '<div class="actions"><a class="btn" href="' + safeUrl + '" target="_blank" rel="noopener">\\u2B07 Descargar</a></div>' : "") +
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
  let html = '<div class="header"><h2>Archivos</h2><span class="count">' + items.length + ' archivos</span></div>';
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
      '<div class="progress-text" id="progressText">Subiendo...</div>' +
    '</div>';
}

function showSuccess(name, size) {
  root.innerHTML =
    '<div class="success">' +
      '<div class="success-icon">\\u2705</div>' +
      '<div class="success-name">' + escapeHtml(name) + '</div>' +
      '<div class="success-meta">' + formatSize(size) + ' subido</div>' +
      '<button class="btn-upload-more" onclick="location.reload()">Subir otro</button>' +
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

export const loader = () => {
  const thumbnails: Record<string, string> = {};
  for (const app of APPS_META) {
    thumbnails[app.slug] = makeDemoHtml(HTML_TEMPLATES[app.slug], DEMO_SCRIPTS[app.slug]);
  }
  return { thumbnails };
};

export default function McpApps({ loaderData }: Route.ComponentProps) {
  const { thumbnails } = loaderData;

  return (
    <section className="overflow-hidden w-full min-h-screen flex flex-col bg-white">
      {/* Nav */}
      <nav className="border-b-2 border-black px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/inicio" className="flex items-center gap-2">
            <img src="/icons/easybits-logo.svg" alt="EasyBits" className="w-8 h-8" />
            <span className="font-bold text-xl">EasyBits</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/docs" className="text-sm font-medium hover:underline">
              Docs
            </Link>
            <Link to="/developers" className="text-sm font-medium hover:underline">
              Developers
            </Link>
            <Link to="/blog" className="text-sm font-medium hover:underline">
              Blog
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

      {/* Hero */}
      <div className="px-6 py-16 text-center">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block mb-4 px-3 py-1 text-xs font-bold uppercase tracking-wider bg-purple-100 text-purple-700 rounded-full border border-purple-300">
            Experimental
          </span>
          <h1 className="text-3xl md:text-5xl font-bold mb-4">
            MCP Apps UI
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Interfaces visuales inline para clientes MCP. EasyBits es early adopter de la spec que permite renderizar UIs directamente dentro de Claude, Cursor y otros clientes.
          </p>
        </div>
      </div>

      {/* Grid */}
      <div className="px-6 pb-16">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {APPS_META.map((app) => (
            <div
              key={app.slug}
              className="border-2 border-black rounded-xl bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col"
            >
              {/* Thumbnail iframe */}
              <div className="relative w-full h-56 overflow-hidden bg-[#0a0a0a] border-b-2 border-black">
                <iframe
                  srcDoc={thumbnails[app.slug]}
                  className="absolute top-0 left-0 w-[200%] h-[200%] border-none pointer-events-none"
                  style={{ transform: "scale(0.5)", transformOrigin: "top left" }}
                  sandbox="allow-scripts"
                  title={app.name}
                />
              </div>

              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-bold">{app.name}</h3>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-amber-100 text-amber-700 rounded border border-amber-300 shrink-0">
                    Experimental
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-3 flex-1">{app.description}</p>
                <p className="text-xs text-gray-400 mb-4 font-mono">
                  Tool: <span className="text-gray-600">{app.tool}</span>
                </p>
                <Link
                  to={`/mcp/apps/${app.slug}`}
                  className="block text-center bg-black text-white px-4 py-2.5 rounded-xl text-sm font-bold border-2 border-black hover:translate-y-[-2px] transition-transform"
                >
                  Ver Demo
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Build in Public section */}
      <div className="px-6 pb-20">
        <div className="max-w-3xl mx-auto border-2 border-black rounded-xl p-8 bg-gray-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <h2 className="text-2xl font-bold mb-4">Build in Public</h2>
          <div className="space-y-4 text-gray-700">
            <p>
              <strong>MCP Apps UI</strong> es una extension del Model Context Protocol que permite a los servidores MCP
              renderizar interfaces visuales directamente dentro de los clientes. Todavia ningun cliente la soporta de forma nativa.
            </p>
            <p>
              En EasyBits apostamos por esta spec porque creemos que el futuro de la interaccion con agentes AI incluye
              componentes visuales ricos: previews de archivos, formularios de upload, navegadores de datos.
            </p>
            <p>
              Estas 3 UIs ya estan registradas en nuestro servidor MCP con{" "}
              <code className="bg-gray-200 px-1.5 py-0.5 rounded text-sm font-mono">@modelcontextprotocol/ext-apps@1.2.0</code>.
              Cuando los clientes soporten la spec, funcionaran automaticamente.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href="https://modelcontextprotocol.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium underline hover:no-underline"
              >
                MCP Spec
              </a>
              <Link to="/mcp" className="text-sm font-medium underline hover:no-underline">
                Conectar EasyBits
              </Link>
              <Link to="/blog/mcp-apps-ui-easybits-laboratorio" className="text-sm font-medium underline hover:no-underline">
                Leer blog post
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </section>
  );
}
