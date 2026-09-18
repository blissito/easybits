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

  // Check custom domain first (anything not .easybits.cloud)
  if (!hostname.endsWith(".easybits.cloud") && hostname !== "easybits.cloud") {
    return handleCustomDomain(request, hostname, url);
  }

  if (hostname.startsWith("www")) {
    return null;
  }

  // Only match single-level subdomains: <slug>.easybits.cloud
  const parts = hostname.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const subdomain = parts[0];
  if (!subdomain || subdomain === "www" || subdomain === "api") {
    return null;
  }

  const website = await db.website.findFirst({
    where: {
      slug: subdomain,
      subdomainEnabled: true,
      status: { not: "DELETED" },
    },
    select: { id: true, ownerId: true },
  });

  if (!website) {
    return new Response("Site not found", { status: 404 });
  }

  return serveWebsiteFile(website, request, url);
}

export type CustomHost =
  | { kind: "apex"; domain: string }
  | { kind: "www"; domain: string }
  | { kind: "slug"; domain: string; slug: string }
  | { kind: "none" };

/** Clasifica un host que NO es easybits.cloud. Puro, sin DB. */
export function parseCustomHost(hostname: string): CustomHost {
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length < 2) return { kind: "none" };
  if (parts.length === 2) return { kind: "apex", domain: hostname };
  const slug = parts[0];
  const domain = parts.slice(1).join(".");
  if (slug === "www" && parts.length === 3) return { kind: "www", domain };
  return { kind: "slug", domain, slug };
}

/**
 * Handle requests to custom domains.
 * - midominio.com / www.midominio.com → sitio apex del dominio (CustomDomain.apexWebsiteId).
 *   www redirige 301 al apex (URL canónica). Sin apex asignado: comportamiento previo
 *   (apex → null; "www" se trata como slug).
 * - <slug>.midominio.com → website del dueño por slug (sin cambios).
 */
async function handleCustomDomain(request: Request, hostname: string, url: URL): Promise<Response | null> {
  const parsed = parseCustomHost(hostname);
  if (parsed.kind === "none") return null;

  if (parsed.kind === "apex" || parsed.kind === "www") {
    const apex = await db.customDomain.findFirst({
      where: { domain: parsed.domain, verified: true, apexWebsiteId: { not: null } },
      select: { apexWebsite: { select: { id: true, ownerId: true, status: true } } },
    });
    const website = apex?.apexWebsite;
    if (website && website.status !== "DELETED") {
      if (parsed.kind === "www") {
        return Response.redirect(`https://${parsed.domain}${url.pathname}${url.search}`, 301);
      }
      return serveWebsiteFile(website, request, url);
    }
    if (parsed.kind === "apex") return null; // sin apex: cae a la app, como antes
  }

  const slug = parsed.kind === "slug" ? parsed.slug : "www";
  const rootDomain = parsed.domain;

  // Find verified custom domain
  const customDomain = await db.customDomain.findFirst({
    where: { domain: rootDomain, verified: true },
    select: { id: true, ownerId: true },
  });

  if (!customDomain) {
    return null;
  }

  // Find website by slug + owner
  const website = await db.website.findFirst({
    where: {
      slug,
      ownerId: customDomain.ownerId,
      status: { not: "DELETED" },
    },
    select: { id: true, ownerId: true },
  });

  if (!website) {
    return new Response("Site not found", { status: 404 });
  }

  return serveWebsiteFile(website, request, url);
}

/**
 * Sirve un archivo del sitio (sites/<id>/<path>): proxy desde storage, fallback
 * <path>/index.html y SPA fallback a index.html. Compartido por las tres rutas.
 */
async function serveWebsiteFile(
  website: { id: string; ownerId: string },
  request: Request,
  url: URL
): Promise<Response> {
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

  // Proxy all files (no 302 redirects — avoids CORS/iframe issues)
  const client = getPlatformDefaultClient();
  const readUrl = file.access === "public" && file.url
    ? file.url
    : await client.getReadUrl(file.storageKey);
  const upstream = await fetch(readUrl);
  const contentType = getContentType(splat);
  const cacheControl = isImmutable(splat)
    ? "public, max-age=31536000, immutable"
    : "no-cache, no-store, must-revalidate";

  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
