import { BlogSEOService } from "~/.server/blog/seo";

export const loader = async () => {
  const sitemap = await BlogSEOService.generateSitemap();

  return new Response(sitemap, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600", // Cache for 1 hour
    },
  });
};

export default function Sitemap() {
  return null; // This route doesn't render anything
}
