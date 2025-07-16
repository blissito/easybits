import type { Config } from "@react-router/dev/config";
import { db } from "./app/.server/db";

// Hardcoded blog posts for prerendering
const BLOG_POSTS = [
  "como-conectar-stripe-onboarding",
  "tendencias-economia-creadores-2025",
  "monetizar-conocimiento-online",
  "marketing-digital-para-creadores",
  "como-crear-assets-digitales-exitosos",
  "herramientas-esenciales-creadores-2025",
];

export default {
  ssr: true,
  prerender: async () => {
    const routes = ["/inicio"];

    // Add blog routes
    routes.push("/blog", ...BLOG_POSTS.map((slug) => `/blog/${slug}`));

    console.log(`📝 Prerendering ${BLOG_POSTS.length} blog posts`);

    // Add static routes
    routes.push(
      "/planes",
      "/funcionalidades",
      "/terminos-y-condiciones",
      "/aviso-de-privacidad",
      "/sitemap.xml",
      "/robots.txt"
    );

    return routes;
  },
} satisfies Config;
