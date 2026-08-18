import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  prerender: async () => [
    // Rutas de marketing: contenido fijo que vale la pena servir ya horneado.
    "/inicio",
    // /blog va prerenderizada por una razón no obvia: `build/client/blog/assets/`
    // existe (ahí viven las imágenes), así que sin un index.html propio el
    // servidor estático trata /blog como directorio y responde 301 → /blog/.
    // Con la lista horneada se sirve directo, y el índice sale del directorio de
    // posts, así que el snapshot es correcto en cada deploy.
    "/blog",
    "/planes",
    "/funcionalidades",
    "/terminos-y-condiciones",
    "/aviso-de-privacidad",
    "/sitemap.xml",
    "/robots.txt",
    // Los POSTS no se prerenderizan: eran una lista a mano de 8 slugs —el cuarto
    // registro paralelo de posts en el repo, y ya obsoleta— y cada uno costaba
    // build en cada deploy. Con `ssr: true` se sirven leyendo el .mdx del disco.
  ],
} satisfies Config;
