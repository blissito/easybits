import type { BlockType } from "./blockTypes";

export const BLOCK_DEFAULTS: Record<BlockType, Record<string, any>> = {
  hero: {
    headline: "Tu producto increíble",
    subtitle: "Una descripción breve que explique el valor de tu producto o servicio.",
    ctaText: "Comenzar ahora",
    ctaUrl: "#",
    imageUrl: "",
  },
  text: {
    title: "Sobre nosotros",
    body: "Escribe aquí el contenido de tu sección. Puedes hablar sobre tu empresa, tu misión, o cualquier información relevante para tus visitantes.",
  },
  imageText: {
    title: "Característica principal",
    body: "Describe tu característica más importante aquí. Explica cómo beneficia a tus usuarios.",
    imageUrl: "https://placehold.co/600x400/e2e8f0/64748b?text=Imagen",
    imagePosition: "right",
  },
  cta: {
    headline: "¿Listo para empezar?",
    subtitle: "Únete a miles de usuarios satisfechos.",
    ctaText: "Empezar gratis",
    ctaUrl: "#",
  },
  footer: {
    companyName: "Mi Empresa",
    links: [
      { label: "Inicio", url: "#" },
      { label: "Contacto", url: "#" },
    ],
  },
};
