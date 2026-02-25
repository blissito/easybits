import type { Route } from "./+types/s.$slug.$";
import { db } from "~/.server/db";
import { getPlatformDefaultClient } from "~/.server/storage";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
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
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wasm": "application/wasm",
};

function getContentType(path: string): string {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function isImmutable(path: string): boolean {
  return /\.(css|js|mjs|woff2?|ttf|eot|png|jpg|jpeg|gif|svg|webp|avif|ico|wasm)$/i.test(path);
}

export async function loader({ params }: Route.LoaderArgs) {
  const { slug } = params;
  const splat = params["*"] || "index.html";

  const website = await db.website.findUnique({ where: { slug } });
  if (!website || website.status === "DELETED") {
    throw new Response("Site not found", { status: 404 });
  }

  const client = getPlatformDefaultClient();

  // The files are stored under the storage key pattern: {ownerId}/{nanoid}
  // but named as sites/{websiteId}/{path}. We need to find the file by name.
  const storageKeyPrefix = `sites/${website.id}/${splat}`;

  // Look up the file record
  let file = await db.file.findFirst({
    where: {
      name: `sites/${website.id}/${splat}`,
      ownerId: website.ownerId,
      status: { not: "DELETED" },
    },
  });

  // Fallback: try index.html for directory paths
  if (!file && !splat.includes(".")) {
    const indexPath = splat === "index.html" ? splat : `${splat}/index.html`;
    file = await db.file.findFirst({
      where: {
        name: `sites/${website.id}/${indexPath}`,
        ownerId: website.ownerId,
        status: { not: "DELETED" },
      },
    });
  }

  if (!file) {
    // Try root index.html as SPA fallback
    if (splat !== "index.html") {
      file = await db.file.findFirst({
        where: {
          name: `sites/${website.id}/index.html`,
          ownerId: website.ownerId,
          status: { not: "DELETED" },
        },
      });
      if (file) {
        // SPA fallback — serve index.html with no-cache
        const readUrl = await client.getReadUrl(file.storageKey);
        const upstream = await fetch(readUrl);
        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        });
      }
    }
    throw new Response("Not found", { status: 404 });
  }

  const readUrl = await client.getReadUrl(file.storageKey);
  const upstream = await fetch(readUrl);

  const contentType = getContentType(splat);
  const cacheControl = isImmutable(splat)
    ? "public, max-age=31536000, immutable"
    : "no-cache, no-store, must-revalidate";

  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    },
  });
}
