import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  // Desde react-router 7.18 una acción se rechaza (400 «Bad Request») si el Origin no coincide
  // con request.url, ESQUEMA incluido. Detrás de Caddy la app ve http:// y el navegador manda
  // https:// → todo POST .data (login incluido) fallaba desde el bump del 20-oct. Sólo nuestros
  // dominios: NUNCA *.easybits.cloud, que sirve sitios de usuarios (sería CSRF abierto).
  allowedActionOrigins: ["www.easybits.cloud", "easybits.cloud"],
  prerender: async () => [
    // Rutas de marketing: contenido fijo que vale la pena servir ya horneado.
    "/inicio",
    // /blog va prerenderizada por una razón no obvia: `build/client/blog/assets/`
    // existe (ahí viven las imágenes), así que sin un index.html propio el
    // servidor estático trata /blog como directorio y responde 301 → /blog/.
    // Con la lista horneada se sirve directo, y el índice sale del directorio de
    // posts, así que el snapshot es correcto en cada deploy.
    "/blog",
    "/aprende",
    "/aprende/arranca",
    "/aprende/agente-en-produccion",
    "/aprende/vende-tu-agente",
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
