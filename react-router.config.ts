import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  prerender: async () => [
    // Rutas de marketing: contenido fijo que vale la pena servir ya horneado.
    "/inicio",
    "/planes",
    "/funcionalidades",
    "/terminos-y-condiciones",
    "/aviso-de-privacidad",
    "/sitemap.xml",
    "/robots.txt",
    // Los posts del blog NO se prerenderizan: eran una lista a mano de 8 slugs
    // —el cuarto registro paralelo de posts en el repo, y ya obsoleta— y cada
    // uno costaba tiempo de build en cada deploy. Con `ssr: true` se sirven
    // igual, leyendo el .mdx del disco. La lista /blog tampoco: cambia con cada
    // post y prerenderizarla sólo garantiza que salga vieja.
  ],
} satisfies Config;
