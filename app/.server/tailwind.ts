/**
 * Horneado de Tailwind — re-export de la implementación del paquete.
 *
 * La lógica vive en `@easybits.cloud/html-tailwind-generator/bake` porque el
 * problema que resuelve lo tiene TODO consumidor de `buildDeployHtml`, no solo
 * EasyBits: el builder emite `<script src="https://cdn.tailwindcss.com">` SÍNCRONO
 * en el `<head>`, que bloquea el render mientras bajan ~400 KB y, sin caché
 * compartida (iframe de origen opaco), se re-descarga en CADA visita → la página
 * se ve EN BLANCO 20-30 segundos.
 *
 * Este archivo se queda como punto de entrada estable para el código de la app
 * (varios módulos ya importaban `replaceCdnWithCompiledCSS` desde aquí).
 */
export {
  bakeTailwindHtml,
  compileTailwindCSS,
  replaceCdnWithCompiledCSS,
  type BakeOptions,
} from "@easybits.cloud/html-tailwind-generator/bake";
