import { db } from "./db";
import { trackTelemetryVisit } from "./telemetry";
import { getPlatformDefaultClient } from "./storage";
import { getContentType } from "~/utils/mime";

function isImmutable(path: string): boolean {
  return /\.(css|js|mjs|woff2?|ttf|eot|png|jpg|jpeg|gif|svg|webp|avif|ico|wasm)$/i.test(path);
}

/**
 * Intercepts subdomain website requests before React Router rendering.
 * For public files → 302 redirect to CDN URL (zero proxy overhead).
 * For private files → presigned URL redirect.
 * Returns null if not a subdomain website request.
 */
export async function handleSubdomainWebsite(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // Fly.io may not set the hostname in request.url — use Host header as primary source
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.hostname;
  const hostname = host.split(":")[0]; // strip port

  if (!hostname.endsWith(".easybits.cloud") || hostname.startsWith("www")) {
    return null;
  }

  const subdomain = hostname.split(".")[0];
  if (!subdomain || subdomain === "www" || subdomain === "api") {
    return null;
  }

  const website = await db.website.findFirst({
    where: { slug: subdomain, status: { not: "DELETED" } },
    select: { id: true, ownerId: true },
  });

  if (!website) {
    return new Response("Site not found", { status: 404 });
  }

  const splat = url.pathname === "/" ? "index.html" : url.pathname.slice(1);

  // Track visit only for the main page request (not static assets)
  if (!isImmutable(splat)) {
    trackTelemetryVisit({
      asset: { ownerId: website.ownerId, id: website.id },
      request,
      linkType: "website",
    }).catch(() => {});
  }

  // Find the file record
  let file = await db.file.findFirst({
    where: {
      name: `sites/${website.id}/${splat}`,
      ownerId: website.ownerId,
      status: "DONE",
    },
    select: { url: true, storageKey: true, access: true },
  });

  // Fallback: try index.html for directory paths
  if (!file && !splat.includes(".")) {
    const indexPath = `${splat}/index.html`;
    file = await db.file.findFirst({
      where: {
        name: `sites/${website.id}/${indexPath}`,
        ownerId: website.ownerId,
        status: "DONE",
      },
      select: { url: true, storageKey: true, access: true },
    });
  }

  // SPA fallback: serve index.html
  if (!file && splat !== "index.html") {
    file = await db.file.findFirst({
      where: {
        name: `sites/${website.id}/index.html`,
        ownerId: website.ownerId,
        status: "DONE",
      },
      select: { url: true, storageKey: true, access: true },
    });
    if (file) {
      // SPA fallback — proxy index.html (no redirect, keeps URL clean)
      const client = getPlatformDefaultClient();
      const readUrl = await client.getReadUrl(file.storageKey);
      const upstream = await fetch(readUrl);
      return new Response(upstream.body, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }
    return new Response("Not found", { status: 404 });
  }

  if (!file) {
    return new Response("Not found", { status: 404 });
  }

  // Public file with CDN URL → redirect (no proxy overhead)
  if (file.access === "public" && file.url) {
    const cacheControl = isImmutable(splat)
      ? "public, max-age=31536000, immutable"
      : "no-cache, no-store, must-revalidate";
    return new Response(null, {
      status: 302,
      headers: {
        Location: file.url,
        "Cache-Control": cacheControl,
      },
    });
  }

  // Private file → proxy through presigned URL
  const client = getPlatformDefaultClient();
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
