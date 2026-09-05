import { BlogSEOService } from "~/.server/blog/seo";

// Sin `export default` — ver la nota en robots.txt.ts: un componente hace que el
// prerender emita una carpeta con index.html y el sitemap nunca se sirve como XML.
export const loader = async () => {
  const sitemap = await BlogSEOService.generateSitemap();

  return new Response(sitemap, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600", // Cache for 1 hour
    },
  });
};
