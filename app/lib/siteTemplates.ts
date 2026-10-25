/**
 * Plantillas de partida de una web app de /dash/sitios. Viven horneadas en la caja dorada
 * (`pub:site-starter:<stack>`, en /opt/eb-templates/<stack>/<key>) y se copian a /app al
 * sembrar la máquina: el sitio arranca ya armado y el agente lo adapta al prompt.
 * Compartido entre cliente (hero de la home) y servidor (starters).
 */
import type { SiteStackId } from "~/lib/siteStacks";

export const SITE_TEMPLATES = [
  { key: "consultorio", label: "Negocio local" },
  { key: "despacho", label: "Servicios profesionales" },
  { key: "portafolio", label: "Portafolio" },
  { key: "lanzamiento", label: "Lanzamiento" },
  { key: "agente", label: "Agente de IA" },
] as const;

export type SiteTemplateKey = (typeof SITE_TEMPLATES)[number]["key"];

/** Stacks cuya caja dorada trae las plantillas. El resto arranca con su starter vacío. */
export const TEMPLATE_STACKS: readonly SiteStackId[] = ["tanstack", "react-router"];

export function isSiteTemplate(v: unknown): v is SiteTemplateKey {
  return SITE_TEMPLATES.some((t) => t.key === v);
}

export function stackHasTemplates(stack: SiteStackId | null | undefined): stack is SiteStackId {
  return !!stack && TEMPLATE_STACKS.includes(stack);
}

/** Elige la plantilla por palabras del prompt; sin coincidencia, la de negocio local. */
export function templateFor(prompt: string): SiteTemplateKey {
  const p = prompt.toLowerCase();
  if (/fot[oó]|portafolio|boda|galer[ií]a|dise[ñn]ador|arquitect/.test(p)) return "portafolio";
  if (/contab|despacho|abogad|legal|consultor[ií]a|fiscal|n[oó]mina/.test(p)) return "despacho";
  if (/agente|asistente|chatbot|\bbot\b/.test(p)) return "agente";
  if (/lanzamiento|\bapp\b|startup|lista de espera|saas|producto/.test(p)) return "lanzamiento";
  return "consultorio";
}
