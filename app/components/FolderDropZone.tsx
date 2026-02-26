import { useState, useCallback, useRef } from "react";
import { getMimeType } from "~/utils/mime";

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
    const reader = dirEntry.createReader();
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

  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  if (entries.length > 0) {
    if (entries.length === 1 && entries[0].isDirectory) {
      const dirEntry = entries[0] as FileSystemDirectoryEntry;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reader = dirEntry.createReader();
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

function getFolderName(dataTransfer: DataTransfer): string {
  const entry = dataTransfer.items[0]?.webkitGetAsEntry?.();
  return entry?.isDirectory ? entry.name : "mi-sitio";
}

type UploadProgress = {
  total: number;
  uploaded: number;
  failed: number;
  currentFile: string;
  errors: string[];
};

export type CreatedWebsite = {
  id: string;
  name: string;
  slug: string;
  prefix: string;
};

export function FolderDropZone({
  websiteId,
  onWebsiteCreated,
  onComplete,
  className,
  compact,
}: {
  websiteId?: string;
  onWebsiteCreated?: (website: CreatedWebsite) => void;
  onComplete?: (stats: { fileCount: number; totalSize: number }) => void;
  className?: string;
  compact?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const dragCounter = useRef(0);
  const resolvedWebsiteId = useRef<string | undefined>(websiteId);

  const handleUpload = useCallback(
    async (fileEntries: FileEntry[], folderName: string) => {
      // Validate not empty
      if (fileEntries.length === 0) {
        setProgress({
          total: 0, uploaded: 0, failed: 0, currentFile: "",
          errors: ["La carpeta está vacía"],
        });
        return;
      }

      // Sanitize paths — reject traversal attempts
      const sanitized = fileEntries.filter((e) => !e.path.includes(".."));
      if (sanitized.length !== fileEntries.length) {
        // Some paths had traversal — filter them out silently
      }

      // Validate index.html exists
      const hasIndex = sanitized.some(
        (e) => e.path === "index.html" || e.path.endsWith("/index.html")
      );
      if (!hasIndex) {
        setProgress({
          total: 0, uploaded: 0, failed: 0, currentFile: "",
          errors: ["No se encontró index.html — se requiere para publicar un sitio"],
        });
        return;
      }

      const state: UploadProgress = {
        total: sanitized.length,
        uploaded: 0,
        failed: 0,
        currentFile: "",
        errors: [],
      };
      setProgress({ ...state });

      // Create website if needed
      let wId = resolvedWebsiteId.current;
      if (!wId) {
        try {
          const res = await fetch("/api/v2/websites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: folderName }),
          });
          if (!res.ok) {
            state.errors.push(`Error creando sitio: ${res.status}`);
            setProgress({ ...state });
            return;
          }
          const { website } = await res.json();
          wId = website.id;
          resolvedWebsiteId.current = wId;
          onWebsiteCreated?.(website);
        } catch (err) {
          state.errors.push(
            `Error creando sitio: ${err instanceof Error ? err.message : "Unknown"}`
          );
          setProgress({ ...state });
          return;
        }
      }

      let totalSize = 0;
      const CONCURRENCY = 5;
      let idx = 0;

      async function next() {
        while (idx < sanitized.length) {
          const i = idx++;
          const entry = sanitized[i];
          state.currentFile = entry.path;
          setProgress({ ...state });

          try {
            const contentType = getMimeType(entry.file.name);

            // 1. Create file record (PENDING status)
            const res = await fetch("/api/v2/files", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileName: `sites/${wId}/${entry.path}`,
                contentType,
                size: entry.file.size,
                access: "public",
              }),
            });

            if (!res.ok) {
              state.errors.push(`${entry.path}: API error ${res.status}`);
              state.failed++;
              continue;
            }

            const { file, putUrl } = await res.json();

            // 2. Upload to storage
            const uploadRes = await fetch(putUrl, {
              method: "PUT",
              body: entry.file,
              headers: { "Content-Type": contentType },
            });

            if (!uploadRes.ok) {
              state.errors.push(`${entry.path}: Upload failed ${uploadRes.status}`);
              state.failed++;
              continue;
            }

            // 3. Confirm upload — mark DONE
            await fetch(`/api/v2/files/${file.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "DONE" }),
            });

            totalSize += entry.file.size;
          } catch (err) {
            state.errors.push(
              `${entry.path}: ${err instanceof Error ? err.message : "Unknown error"}`
            );
            state.failed++;
          }

          state.uploaded++;
          setProgress({ ...state });
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, sanitized.length) }, next)
      );

      // Update website stats (server computes authoritative counts)
      try {
        await fetch(`/api/v2/websites/${wId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: state.failed > 0 ? "ERROR" : "ACTIVE",
          }),
        });
      } catch {
        // non-critical
      }

      onComplete?.({ fileCount: state.uploaded - state.failed, totalSize });
    },
    [websiteId, onWebsiteCreated, onComplete]
  );

  const isDone = progress && progress.uploaded === progress.total;

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
        const folderName = getFolderName(e.dataTransfer);
        const files = await getFilesFromDrop(e.dataTransfer);
        handleUpload(files, folderName);
      }}
      className={
        className ??
        `border-2 border-dashed rounded-xl ${compact ? "p-4" : "p-8"} text-center transition-colors ${
          dragging
            ? "border-brand-500 bg-brand-50"
            : "border-gray-300 hover:border-gray-400"
        }`
      }
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
              <p className="font-bold">
                {progress.failed} de {progress.total} archivos fallaron:
              </p>
              {progress.errors.slice(0, 5).map((e, i) => (
                <p key={i}>{e}</p>
              ))}
              {progress.errors.length > 5 && (
                <p>...y {progress.errors.length - 5} más</p>
              )}
            </div>
          )}
          {isDone && progress.failed === 0 && (
            <p className="text-green-600 font-bold">Deploy completado</p>
          )}
          {isDone && progress.failed > 0 && progress.failed < progress.total && (
            <p className="text-yellow-600 font-bold">
              Deploy parcial: {progress.uploaded - progress.failed} de {progress.total} archivos
            </p>
          )}
        </div>
      ) : (
        <div>
          <p className={`font-bold mb-1 ${compact ? "text-sm" : "text-lg"}`}>
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
