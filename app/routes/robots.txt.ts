import { BlogSEOService } from "~/.server/blog/seo";

// Sin `export default`: una ruta con componente es "renderizable", y el prerender la
// hornea como documento en build/client/robots.txt/index.html — una CARPETA. El
// servidor estático redirige entonces /robots.txt → /robots.txt/ y sirve el shell de
// la SPA, así que ningún crawler llega al texto. Solo-loader es lo que hace bien
// llms.txt.ts. No añadas un componente aquí.
export const loader = async () => {
  const robotsTxt = BlogSEOService.generateRobotsTxt();

  return new Response(robotsTxt, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400", // Cache for 24 hours
    },
  });
};
