import type { Route } from "./+types/s.$slug.$";
import { db } from "~/.server/db";
import { getPlatformDefaultClient } from "~/.server/storage";
import { getContentType } from "~/utils/mime";

function isImmutable(path: string): boolean {
  return /\.(css|js|mjs|woff2?|ttf|eot|png|jpg|jpeg|gif|svg|webp|avif|ico|wasm)$/i.test(path);
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Inject Open Graph + Twitter meta tags into the HTML head so social unfurls
 * (WhatsApp, Twitter/X, Slack, iMessage) show a rich preview instead of a
 * bare link with just the title.
 *
 * og:image uses the owner's default brand kit logo when present — best
 * available static image without running a screenshot service per request.
 * Falls back to summary card with no image if there's no logo.
 */
function injectMetaTags(
  html: string,
  opts: { title: string; url: string; logoUrl?: string | null }
): string {
  const { title, url, logoUrl } = opts;
  const description = "Documento creado con EasyBits";
  const image = logoUrl || undefined;
  const meta = [
    `<meta name="description" content="${escapeAttr(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:url" content="${escapeAttr(url)}" />`,
    image ? `<meta property="og:image" content="${escapeAttr(image)}" />` : "",
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    image ? `<meta name="twitter:image" content="${escapeAttr(image)}" />` : "",
  ].filter(Boolean).join("\n  ");

  // If the HTML already has an og:title (e.g. future template includes them),
  // don't double-inject — leave it alone.
  if (/<meta[^>]+property=["']og:title["']/i.test(html)) return html;

  // Insert right after </title>; if no title tag, right after <head>.
  if (/<\/title>/i.test(html)) {
    return html.replace(/<\/title>/i, `</title>\n  ${meta}`);
  }
  return html.replace(/<head([^>]*)>/i, `<head$1>\n  ${meta}`);
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
        const readUrl = file.access === "public" && file.url
          ? file.url
          : await client.getReadUrl(file.storageKey);
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

  const readUrl = file.access === "public" && file.url
    ? file.url
    : await client.getReadUrl(file.storageKey);
  const upstream = await fetch(readUrl);

  const contentType = getContentType(splat);
  const cacheControl = isImmutable(splat)
    ? "public, max-age=31536000, immutable"
    : "no-cache, no-store, must-revalidate";

  // Inject social preview meta tags into HTML responses so WhatsApp/Twitter
  // unfurls show a rich preview. Assets (CSS/JS/images) pass through as stream.
  if (contentType.startsWith("text/html")) {
    const html = await upstream.text();
    const { getDefaultBrandKit } = await import("~/.server/core/brandKitOperations");
    const kit = await getDefaultBrandKit(website.ownerId).catch(() => null);
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const title = titleMatch?.[1]?.trim() || website.name || "Documento";
    const canonical = `https://www.easybits.cloud/s/${website.slug}${splat === "index.html" ? "" : "/" + splat}`;
    const patched = injectMetaTags(html, { title, url: canonical, logoUrl: kit?.logoUrl });
    return new Response(patched, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      },
    });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    },
  });
}
