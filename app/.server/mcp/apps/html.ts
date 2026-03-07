// Inline HTML for MCP Apps UI resources.
// These are exported as strings so they get bundled into the server JS.

export const filePreviewHtml = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>EasyBits File Preview</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0a0a0a;
    color: #e5e5e5;
    padding: 16px;
    min-height: 100px;
  }
  .card {
    background: #171717;
    border: 1px solid #262626;
    border-radius: 12px;
    overflow: hidden;
    max-width: 560px;
  }
  .preview {
    background: #0a0a0a;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    max-height: 400px;
    overflow: hidden;
  }
  .preview img, .preview video {
    max-width: 100%;
    max-height: 400px;
    object-fit: contain;
  }
  .preview audio { width: 100%; padding: 24px 16px; }
  .info {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .name {
    font-size: 16px;
    font-weight: 600;
    color: #fafafa;
    word-break: break-all;
  }
  .meta {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    font-size: 13px;
    color: #a3a3a3;
  }
  .meta span { white-space: nowrap; }
  .actions { padding: 0 16px 16px; }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: #9870ED;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.15s;
  }
  .btn:hover { background: #7c5acc; }
  .icon-card {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    font-size: 48px;
  }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }
  .badge-public { background: #065f46; color: #6ee7b7; }
  .badge-private { background: #78350f; color: #fbbf24; }
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    color: #737373;
  }
</style>
</head>
<body>
<div id="root"><div class="loading">Loading file preview...</div></div>
<script type="module">
import { App, PostMessageTransport } from "https://esm.sh/@modelcontextprotocol/ext-apps@1.2.0?bundle-deps";

const app = new App({ name: "EasyBitsFilePreview", version: "1.0.0" });

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

function getFileIcon(contentType) {
  if (!contentType) return "\\u{1F4C4}";
  if (contentType.startsWith("image/")) return "\\u{1F5BC}";
  if (contentType.startsWith("video/")) return "\\u{1F3AC}";
  if (contentType.startsWith("audio/")) return "\\u{1F3B5}";
  if (contentType.includes("pdf")) return "\\u{1F4D1}";
  if (contentType.includes("zip") || contentType.includes("tar") || contentType.includes("gz")) return "\\u{1F4E6}";
  if (contentType.includes("json") || contentType.includes("xml") || contentType.includes("text")) return "\\u{1F4DD}";
  return "\\u{1F4C4}";
}

function escapeHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function render(file) {
  const ct = file.contentType || "";
  const isImage = ct.startsWith("image/");
  const isVideo = ct.startsWith("video/");
  const isAudio = ct.startsWith("audio/");
  const isPdf = ct.includes("pdf");
  const url = file.readUrl || file.url || "";
  const safeUrl = escapeHtml(url);
  const safeName = escapeHtml(file.name || "");

  let previewHtml = "";
  if (isImage && url) {
    previewHtml = '<div class="preview"><img src="' + safeUrl + '" alt="' + safeName + '"></div>';
  } else if (isVideo && url) {
    previewHtml = '<div class="preview"><video src="' + safeUrl + '" controls preload="metadata"></video></div>';
  } else if (isAudio && url) {
    previewHtml = '<div class="preview"><audio src="' + safeUrl + '" controls preload="metadata"></audio></div>';
  } else if (isPdf && url) {
    previewHtml = '<div class="preview" style="min-height:400px"><iframe src="' + safeUrl + '" style="width:100%;height:400px;border:none"></iframe></div>';
  } else {
    previewHtml = '<div class="preview"><div class="icon-card">' + getFileIcon(ct) + '</div></div>';
  }

  const accessBadge = file.access
    ? '<span class="badge ' + (file.access === "public" ? "badge-public" : "badge-private") + '">' + escapeHtml(file.access) + '</span>'
    : "";

  document.getElementById("root").innerHTML =
    '<div class="card">' +
      previewHtml +
      '<div class="info">' +
        '<div class="name">' + (safeName || "Untitled") + ' ' + accessBadge + '</div>' +
        '<div class="meta">' +
          '<span>' + escapeHtml(ct || "Unknown type") + '</span>' +
          '<span>' + formatSize(file.size) + '</span>' +
          '<span>' + formatDate(file.createdAt) + '</span>' +
        '</div>' +
      '</div>' +
      (url ? '<div class="actions"><a class="btn" href="' + safeUrl + '" target="_blank" rel="noopener">\\u2B07 Download</a></div>' : "") +
    '</div>';
}

app.ontoolresult = (params) => {
  if (params.structuredContent) {
    render(params.structuredContent);
  } else if (params.content) {
    try {
      const text = params.content.find(c => c.type === "text");
      if (text) render(JSON.parse(text.text));
    } catch {}
  }
};

app.ontoolinput = () => {};

const transport = new PostMessageTransport();
await app.connect(transport);
<\/script>
</body>
</html>`;

export const fileListHtml = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>EasyBits File List</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0a0a0a;
    color: #e5e5e5;
    padding: 16px;
  }
  .container { max-width: 640px; }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .header h2 {
    font-size: 16px;
    font-weight: 600;
    color: #fafafa;
  }
  .count {
    font-size: 12px;
    color: #737373;
  }
  .file-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .file-row {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #171717;
    border: 1px solid #262626;
    border-radius: 10px;
    padding: 10px 14px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .file-row:hover {
    border-color: #9870ED;
    background: #1a1525;
  }
  .file-icon {
    font-size: 22px;
    flex-shrink: 0;
    width: 32px;
    text-align: center;
  }
  .file-info {
    flex: 1;
    min-width: 0;
  }
  .file-name {
    font-size: 14px;
    font-weight: 500;
    color: #fafafa;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .file-meta {
    font-size: 12px;
    color: #737373;
    display: flex;
    gap: 10px;
    margin-top: 2px;
  }
  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    flex-shrink: 0;
  }
  .badge-public { background: #065f46; color: #6ee7b7; }
  .badge-private { background: #78350f; color: #fbbf24; }
  .load-more {
    display: block;
    width: 100%;
    margin-top: 8px;
    padding: 10px;
    background: #171717;
    border: 1px solid #262626;
    border-radius: 10px;
    color: #9870ED;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    text-align: center;
    transition: border-color 0.15s;
  }
  .load-more:hover { border-color: #9870ED; }
  .empty {
    text-align: center;
    color: #525252;
    padding: 32px 16px;
    font-size: 14px;
  }
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 80px;
    color: #737373;
  }
</style>
</head>
<body>
<div class="container" id="root"><div class="loading">Loading files...</div></div>
<script type="module">
import { App, PostMessageTransport } from "https://esm.sh/@modelcontextprotocol/ext-apps@1.2.0?bundle-deps";

const app = new App({ name: "EasyBitsFileList", version: "1.0.0" });
const root = document.getElementById("root");

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

function getFileIcon(contentType) {
  if (!contentType) return "\\u{1F4C4}";
  if (contentType.startsWith("image/")) return "\\u{1F5BC}";
  if (contentType.startsWith("video/")) return "\\u{1F3AC}";
  if (contentType.startsWith("audio/")) return "\\u{1F3B5}";
  if (contentType.includes("pdf")) return "\\u{1F4D1}";
  if (contentType.includes("zip") || contentType.includes("tar") || contentType.includes("gz")) return "\\u{1F4E6}";
  if (contentType.includes("json") || contentType.includes("xml") || contentType.includes("text")) return "\\u{1F4DD}";
  return "\\u{1F4C4}";
}

function escapeHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function render(data) {
  const items = data.items || [];
  if (items.length === 0) {
    root.innerHTML = '<div class="empty">No files found</div>';
    return;
  }

  let html = '<div class="header"><h2>Files</h2><span class="count">' + items.length + ' file' + (items.length !== 1 ? 's' : '') + '</span></div>';
  html += '<div class="file-list">';

  for (const f of items) {
    const badge = f.access
      ? '<span class="badge ' + (f.access === "public" ? "badge-public" : "badge-private") + '">' + escapeHtml(f.access) + '</span>'
      : "";
    html +=
      '<div class="file-row" data-id="' + escapeHtml(f.id) + '">' +
        '<div class="file-icon">' + getFileIcon(f.contentType) + '</div>' +
        '<div class="file-info">' +
          '<div class="file-name">' + escapeHtml(f.name || "Untitled") + '</div>' +
          '<div class="file-meta">' +
            '<span>' + formatSize(f.size) + '</span>' +
            '<span>' + escapeHtml(f.contentType || "") + '</span>' +
            '<span>' + formatDate(f.createdAt) + '</span>' +
          '</div>' +
        '</div>' +
        badge +
      '</div>';
  }

  html += '</div>';

  if (data.nextCursor) {
    html += '<button class="load-more" id="loadMore">Load more</button>';
  }

  root.innerHTML = html;

  root.querySelectorAll(".file-row").forEach(row => {
    row.addEventListener("click", async () => {
      const fileId = row.getAttribute("data-id");
      if (fileId) {
        try { await app.callServerTool({ name: "get_file", arguments: { fileId } }); } catch {}
      }
    });
  });

  const loadBtn = document.getElementById("loadMore");
  if (loadBtn) {
    loadBtn.addEventListener("click", async () => {
      loadBtn.textContent = "Loading...";
      try { await app.callServerTool({ name: "list_files", arguments: { cursor: data.nextCursor } }); } catch {}
    });
  }
}

app.ontoolresult = (params) => {
  if (params.structuredContent) {
    if (params.structuredContent.items) {
      render(params.structuredContent);
    }
    // If it's a get_file result (single file), the file-preview app handles it
  } else if (params.content) {
    try {
      const text = params.content.find(c => c.type === "text");
      if (text) {
        const parsed = JSON.parse(text.text);
        if (parsed.items) render(parsed);
      }
    } catch {}
  }
};

app.ontoolinput = () => {};

const transport = new PostMessageTransport();
await app.connect(transport);
<\\/script>
</body>
</html>`;

export const fileUploadHtml = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>EasyBits File Upload</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0a0a0a;
    color: #e5e5e5;
    padding: 16px;
  }
  .container { max-width: 480px; }
  .dropzone {
    border: 2px dashed #404040;
    border-radius: 12px;
    padding: 48px 24px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    background: #171717;
  }
  .dropzone:hover, .dropzone.dragover {
    border-color: #9870ED;
    background: #1a1525;
  }
  .dropzone-icon { font-size: 36px; margin-bottom: 12px; }
  .dropzone-text { font-size: 15px; color: #a3a3a3; }
  .dropzone-text strong { color: #9870ED; }
  .dropzone-hint { font-size: 12px; color: #525252; margin-top: 8px; }
  input[type="file"] { display: none; }
  .progress-container {
    background: #171717;
    border: 1px solid #262626;
    border-radius: 12px;
    padding: 20px;
  }
  .file-name {
    font-size: 14px;
    font-weight: 500;
    color: #fafafa;
    margin-bottom: 4px;
    word-break: break-all;
  }
  .file-meta {
    font-size: 12px;
    color: #737373;
    margin-bottom: 12px;
  }
  .progress-bar {
    width: 100%;
    height: 6px;
    background: #262626;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 8px;
  }
  .progress-fill {
    height: 100%;
    background: #9870ED;
    border-radius: 3px;
    transition: width 0.2s;
    width: 0%;
  }
  .progress-text {
    font-size: 12px;
    color: #a3a3a3;
    text-align: right;
  }
  .success {
    background: #171717;
    border: 1px solid #065f46;
    border-radius: 12px;
    padding: 20px;
    text-align: center;
  }
  .success-icon { font-size: 36px; margin-bottom: 8px; }
  .success-name { font-size: 15px; font-weight: 600; color: #6ee7b7; margin-bottom: 4px; }
  .success-meta { font-size: 12px; color: #737373; margin-bottom: 12px; }
  .btn-upload-more {
    display: inline-block;
    padding: 8px 16px;
    background: transparent;
    color: #9870ED;
    border: 1px solid #9870ED;
    border-radius: 8px;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-upload-more:hover { background: #1a1525; }
  .error {
    background: #171717;
    border: 1px solid #7f1d1d;
    border-radius: 12px;
    padding: 16px;
    color: #fca5a5;
    font-size: 13px;
    margin-top: 12px;
  }
</style>
</head>
<body>
<div class="container" id="root">
  <div class="dropzone" id="dropzone">
    <div class="dropzone-icon">\\u2B06</div>
    <div class="dropzone-text"><strong>Drop a file</strong> or click to browse</div>
    <div class="dropzone-hint">Max 5 GB</div>
    <input type="file" id="fileInput">
  </div>
</div>
<script type="module">
import { App, PostMessageTransport } from "https://esm.sh/@modelcontextprotocol/ext-apps@1.2.0?bundle-deps";

const app = new App({ name: "EasyBitsFileUpload", version: "1.0.0" });
const root = document.getElementById("root");

function formatSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + " " + units[i];
}

function escapeHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function showError(msg) {
  const existing = document.querySelector(".error");
  if (existing) existing.remove();
  root.insertAdjacentHTML("beforeend", '<div class="error">' + escapeHtml(msg) + '</div>');
}

function showProgress(fileName, fileSize) {
  root.innerHTML =
    '<div class="progress-container">' +
      '<div class="file-name">' + escapeHtml(fileName) + '</div>' +
      '<div class="file-meta">' + formatSize(fileSize) + '</div>' +
      '<div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>' +
      '<div class="progress-text" id="progressText">Preparing upload...</div>' +
    '</div>';
}

function showSuccess(fileName, fileSize) {
  root.innerHTML =
    '<div class="success">' +
      '<div class="success-icon">\\u2705</div>' +
      '<div class="success-name">' + escapeHtml(fileName) + '</div>' +
      '<div class="success-meta">' + formatSize(fileSize) + ' uploaded</div>' +
      '<button class="btn-upload-more" onclick="location.reload()">Upload another</button>' +
    '</div>';
}

async function handleFile(file) {
  showProgress(file.name, file.size);

  try {
    const result = await app.callServerTool({
      name: "upload_file",
      arguments: {
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      },
    });

    let putUrl = null;
    if (result.structuredContent) {
      putUrl = result.structuredContent.putUrl;
    } else if (result.content) {
      const text = result.content.find(c => c.type === "text");
      if (text) {
        const parsed = JSON.parse(text.text);
        putUrl = parsed.putUrl;
      }
    }

    if (!putUrl) {
      showError("Failed to get upload URL from server.");
      return;
    }

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", putUrl);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          document.getElementById("progressFill").style.width = pct + "%";
          document.getElementById("progressText").textContent = pct + "% - " + formatSize(e.loaded) + " / " + formatSize(e.total);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error("Upload failed: HTTP " + xhr.status));
      };
      xhr.onerror = () => reject(new Error("Upload failed: network error"));
      xhr.send(file);
    });

    showSuccess(file.name, file.size);
  } catch (err) {
    showError("Upload error: " + err.message);
  }
}

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");

dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

const transport = new PostMessageTransport();
await app.connect(transport);
<\/script>
</body>
</html>`;
