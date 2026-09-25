import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import type { Command } from "../types.js";
import { need } from "../args.js";
import { emit, fmtBytes, table } from "../output.js";
import { getClient } from "../client.js";
import { CliError, usageError } from "../errors.js";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  zip: "application/zip",
  gz: "application/gzip",
  json: "application/json",
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  csv: "text/csv",
};

export const files: Command = {
  name: "files",
  group: "Storage",
  summary: "Your files in EasyBits storage",
  synopsis: "files",
  defaultSub: "ls",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List your files",
      usage: "easybits files ls",
      examples: ["easybits files ls", "easybits files ls --json"],
      async run(ctx) {
        const eb = await getClient(ctx);
        const data = await eb.listFiles();
        emit(ctx, data.items, () =>
          table(
            data.items.map((f) => ({ ...f, size: fmtBytes(f.size) })),
            [["name", "NAME"], ["size", "SIZE"], ["status", "STATUS"], ["id", "ID"]],
            "No files found",
          ),
        );
      },
    },
    upload: {
      summary: "Upload a local file",
      usage: "easybits files upload <path>",
      examples: ["easybits files upload ./report.pdf", "easybits files upload ./logo.png --json"],
      async run(ctx) {
        const path = need(ctx, 0, "path", this.usage);
        if (!existsSync(path)) throw usageError(`File not found: ${path}`, this.usage);
        const size = statSync(path).size;
        const contentType = MIME[extname(path).slice(1).toLowerCase()] || "application/octet-stream";
        const eb = await getClient(ctx);
        const data = await eb.uploadFile({ fileName: basename(path), contentType, size });
        // La subida va directo al storage con la URL firmada; la API sólo reserva el archivo.
        const res = await fetch(data.putUrl, {
          method: "PUT",
          body: readFileSync(path),
          headers: { "Content-Type": contentType },
        });
        if (!res.ok) throw new CliError(`Upload failed: storage answered ${res.status}`, 1, undefined, "upload_failed", res.status);
        emit(ctx, data.file, () => console.log(`Uploaded: ${data.file.id}`));
      },
    },
    delete: {
      aliases: ["rm"],
      summary: "Delete a file (soft delete, 7-day trash)",
      usage: "easybits files delete <file-id>",
      examples: ["easybits files delete 6650f0c2a1b2c3d4e5f60718"],
      async run(ctx) {
        const id = need(ctx, 0, "file-id", this.usage);
        const eb = await getClient(ctx);
        const r = await eb.deleteFile(id);
        emit(ctx, r, () => console.log("Deleted"));
      },
    },
  },
};
