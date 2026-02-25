import { useState, useCallback, useRef } from "react";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".map": "application/json",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wasm": "application/wasm",
};

function getMimeType(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

type FileEntry = { path: string; file: File };

async function traverseEntry(
  entry: FileSystemEntry,
  basePath: string,
  files: FileEntry[]
): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) =>
      fileEntry.file(resolve, reject)
    );
    const path = basePath ? `${basePath}/${entry.name}` : entry.name;
    files.push({ path, file });
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reader = (dirEntry as any).createDirectoryReader();
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject)
    );
    const dirPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    await Promise.all(entries.map((e) => traverseEntry(e, dirPath, files)));
  }
}

async function getFilesFromDrop(
  dataTransfer: DataTransfer
): Promise<FileEntry[]> {
  const files: FileEntry[] = [];
  const items = dataTransfer.items;

  // Try webkitGetAsEntry for folder support
  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  if (entries.length > 0) {
    // If top-level is a single directory, flatten it (don't include dir name in path)
    if (entries.length === 1 && entries[0].isDirectory) {
      const dirEntry = entries[0] as FileSystemDirectoryEntry;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reader = (dirEntry as any).createDirectoryReader();
      const children = await new Promise<FileSystemEntry[]>(
        (resolve, reject) => reader.readEntries(resolve, reject)
      );
      await Promise.all(children.map((e) => traverseEntry(e, "", files)));
    } else {
      await Promise.all(entries.map((e) => traverseEntry(e, "", files)));
    }
  }

  return files;
}

type UploadProgress = {
  total: number;
  uploaded: number;
  currentFile: string;
  errors: string[];
};

export function FolderDropZone({
  websiteId,
  apiKey,
  onComplete,
}: {
  websiteId: string;
  apiKey: string;
  onComplete?: (stats: { fileCount: number; totalSize: number }) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const dragCounter = useRef(0);

  const handleUpload = useCallback(
    async (fileEntries: FileEntry[]) => {
      if (fileEntries.length === 0) return;

      const state: UploadProgress = {
        total: fileEntries.length,
        uploaded: 0,
        currentFile: "",
        errors: [],
      };
      setProgress({ ...state });

      let totalSize = 0;
      const CONCURRENCY = 5;
      let idx = 0;

      async function next() {
        while (idx < fileEntries.length) {
          const i = idx++;
          const entry = fileEntries[i];
          state.currentFile = entry.path;
          setProgress({ ...state });

          try {
            const contentType = getMimeType(entry.file.name);

            // Get presigned URL from our API
            const res = await fetch("/api/v2/files", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                fileName: `sites/${websiteId}/${entry.path}`,
                contentType,
                size: entry.file.size,
                access: "public",
              }),
            });

            if (!res.ok) {
              state.errors.push(`${entry.path}: API error ${res.status}`);
              continue;
            }

            const { putUrl } = await res.json();

            // Upload to S3
            const uploadRes = await fetch(putUrl, {
              method: "PUT",
              body: entry.file,
              headers: { "Content-Type": contentType },
            });

            if (!uploadRes.ok) {
              state.errors.push(`${entry.path}: Upload failed ${uploadRes.status}`);
              continue;
            }

            totalSize += entry.file.size;
          } catch (err) {
            state.errors.push(
              `${entry.path}: ${err instanceof Error ? err.message : "Unknown error"}`
            );
          }

          state.uploaded++;
          setProgress({ ...state });
        }
      }

      // Run concurrent uploads
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, fileEntries.length) }, next)
      );

      // Update website stats
      try {
        await fetch(`/api/v2/websites/${websiteId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            fileCount: state.uploaded,
            totalSize,
            status: state.errors.length > 0 ? "ERROR" : "ACTIVE",
          }),
        });
      } catch {
        // non-critical
      }

      onComplete?.({ fileCount: state.uploaded, totalSize });
    },
    [websiteId, apiKey, onComplete]
  );

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        dragCounter.current++;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        dragCounter.current--;
        if (dragCounter.current === 0) setDragging(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        dragCounter.current = 0;
        setDragging(false);
        const files = await getFilesFromDrop(e.dataTransfer);
        handleUpload(files);
      }}
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
        dragging
          ? "border-brand-500 bg-brand-50"
          : "border-gray-300 hover:border-gray-400"
      }`}
    >
      {progress ? (
        <div className="space-y-3">
          <p className="font-bold">
            Subiendo {progress.uploaded}/{progress.total} archivos
          </p>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-brand-500 h-3 rounded-full transition-all"
              style={{
                width: `${(progress.uploaded / progress.total) * 100}%`,
              }}
            />
          </div>
          <p className="text-sm text-gray-500 truncate">
            {progress.currentFile}
          </p>
          {progress.errors.length > 0 && (
            <div className="text-red-600 text-sm text-left mt-2">
              <p className="font-bold">{progress.errors.length} errores:</p>
              {progress.errors.slice(0, 5).map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
          {progress.uploaded === progress.total && (
            <p className="text-green-600 font-bold">Deploy completado</p>
          )}
        </div>
      ) : (
        <div>
          <p className="text-lg font-bold mb-1">
            Arrastra tu carpeta de build aquí
          </p>
          <p className="text-sm text-gray-500">
            HTML, CSS, JS, imágenes, fonts — todo se sube automáticamente
          </p>
        </div>
      )}
    </div>
  );
}
