import type { Route } from "./+types/s.$slug.$";
import { db } from "~/.server/db";
import { getPlatformDefaultClient } from "~/.server/storage";
import { getContentType } from "~/utils/mime";

function isImmutable(path: string): boolean {
  return /\.(css|js|mjs|woff2?|ttf|eot|png|jpg|jpeg|gif|svg|webp|avif|ico|wasm)$/i.test(path);
}

export async function loader({ params }: Route.LoaderArgs) {
  const { slug } = params;
  const splat = params["*"] || "index.html";

  const website = await db.website.findFirst({ where: { slug } });
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
      status: "DONE",
    },
  });

  // Fallback: try index.html for directory paths
  if (!file && !splat.includes(".")) {
    const indexPath = splat === "index.html" ? splat : `${splat}/index.html`;
    file = await db.file.findFirst({
      where: {
        name: `sites/${website.id}/${indexPath}`,
        ownerId: website.ownerId,
        status: "DONE",
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
          status: "DONE",
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
