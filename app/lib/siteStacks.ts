// Stacks con starter para las webapps de /dash/sitios. Compartido cliente/servidor:
// aquí sólo va lo que pinta el selector; archivos y prompt viven en ~/.server/starters.
export const SITE_STACKS = [
  { id: "tanstack", label: "TanStack Start", desc: "React con SSR, rutas por archivo y funciones de servidor." },
  { id: "next", label: "Next.js", desc: "React con App Router, Server Components y Server Actions." },
  { id: "nuxt", label: "Nuxt", desc: "Vue con SSR, páginas por archivo y rutas de servidor." },
  { id: "sveltekit", label: "SvelteKit", desc: "Svelte 5, ligero, con load y actions en el servidor." },
  { id: "astro", label: "Astro", desc: "Sitios de contenido con poco JavaScript y endpoints." },
] as const;

export type SiteStackId = (typeof SITE_STACKS)[number]["id"];

export function isSiteStack(v: unknown): v is SiteStackId {
  return SITE_STACKS.some((s) => s.id === v);
}
