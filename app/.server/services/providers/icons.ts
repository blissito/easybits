/**
 * Búsqueda de iconos — devuelve SVG INLINE, nunca una URL.
 *
 * Por qué inline: un `<img src>` a un CDN de terceros mete un punto de fallo en la
 * ruta crítica de render de una página pública, no hereda `currentColor` (adiós modo
 * oscuro y tokens de marca) y desaparece al exportar a PDF. El SVG pegado en el HTML
 * no depende de nadie.
 *
 * El motor está en `@easybits.cloud/html-tailwind-generator/images`, el MISMO que
 * resuelve los `data-icon-query` al generar landings y documentos — así lo que
 * devuelve esta búsqueda es pegable literalmente en ese atributo y cae en el mismo
 * icono.
 *
 * **Cuesta 0 créditos**: Iconify es gratis y cacheado, y cobrar por un icono
 * penalizaría justo el bucle de iteración que queremos que el agente haga.
 */
import { searchIcons } from "@easybits.cloud/html-tailwind-generator/images";
import type { ServiceCtx, ServiceDef, ServiceResult } from "../types";

const SERVICE_ID = "icon.iconify.search";

export interface IconSearchInput {
  query: string;
  style?: string;
  limit?: number;
}

export interface IconSearchOutput extends ServiceResult {
  data: {
    icons: Array<{
      name: string;
      prefix: string;
      set: string;
      svg: string;
      license: string;
      trademark: boolean;
    }>;
    query: string;
  };
}

export const iconSearchService: ServiceDef<IconSearchInput, IconSearchOutput> = {
  id: SERVICE_ID,
  product: "image",
  displayName: "Icon search (Iconify — Lucide/Tabler/Phosphor/…)",
  description:
    "Busca iconos y devuelve el SVG inline listo para pegar, con su licencia y un aviso " +
    "de marca registrada para los logos.",
  estimateCost: () => 0,
  async execute(input, _ctx: ServiceCtx): Promise<IconSearchOutput> {
    // searchIcons nunca lanza: si Iconify no responde devuelve [].
    const icons = await searchIcons(input.query, {
      limit: input.limit,
      style: input.style,
    });
    return { data: { icons, query: input.query } };
  },
};
