export type BlockType =
  | "hero"
  | "text"
  | "imageText"
  | "cta"
  | "footer"
  | "features"
  | "callout"
  | "video"
  | "testimonials"
  | "logoCloud"
  | "team"
  | "stats"
  | "pricing"
  | "faq"
  | "comparison"
  | "chart"
  | "diagram"
  | "timeline"
  | "gallery";

export interface LandingBlock {
  id: string;
  type: BlockType;
  order: number;
  content: Record<string, any>;
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  hero: "Hero",
  text: "Texto",
  imageText: "Imagen + Texto",
  cta: "Call to Action",
  footer: "Footer",
  features: "Features",
  callout: "Callout",
  video: "Video",
  testimonials: "Testimonios",
  logoCloud: "Logo Cloud",
  team: "Equipo",
  stats: "Estadisticas",
  pricing: "Precios",
  faq: "FAQ",
  comparison: "Comparacion",
  chart: "Grafico",
  diagram: "Diagrama",
  timeline: "Timeline",
  gallery: "Galeria",
};

export const BLOCK_ICONS: Record<BlockType, string> = {
  hero: "🎯",
  text: "📝",
  imageText: "🖼️",
  cta: "🚀",
  footer: "📋",
  features: "✨",
  callout: "💡",
  video: "🎬",
  testimonials: "💬",
  logoCloud: "🏢",
  team: "👥",
  stats: "📊",
  pricing: "💰",
  faq: "❓",
  comparison: "⚖️",
  chart: "📈",
  diagram: "🔀",
  timeline: "⏳",
  gallery: "🖼️",
};

export const ALL_BLOCK_TYPES: BlockType[] = [
  "hero",
  "text",
  "imageText",
  "cta",
  "footer",
  "features",
  "callout",
  "video",
  "testimonials",
  "logoCloud",
  "team",
  "stats",
  "pricing",
  "faq",
  "comparison",
  "chart",
  "diagram",
  "timeline",
  "gallery",
];

export interface BlockCategory {
  label: string;
  icon: string;
  types: BlockType[];
}

export const BLOCK_CATEGORIES: BlockCategory[] = [
  {
    label: "Basicos",
    icon: "📦",
    types: ["hero", "text", "imageText", "cta", "footer", "callout"],
  },
  {
    label: "Social Proof",
    icon: "⭐",
    types: ["testimonials", "logoCloud", "team"],
  },
  {
    label: "Datos",
    icon: "📊",
    types: ["stats", "pricing", "faq", "comparison", "chart", "diagram"],
  },
  {
    label: "Secuencia",
    icon: "⏳",
    types: ["timeline"],
  },
  {
    label: "Media",
    icon: "🎬",
    types: ["video", "gallery", "features"],
  },
];

export type BlockVariant = string;

export const BLOCK_VARIANTS: Partial<Record<BlockType, { label: string; value: string }[]>> = {
  features: [
    { label: "Cards", value: "cards" },
    { label: "Cards con icono", value: "cards-icon" },
    { label: "Bordeado", value: "bordered" },
    { label: "Minimal", value: "minimal" },
  ],
  testimonials: [
    { label: "Cards", value: "cards" },
    { label: "Cita grande", value: "quote-large" },
  ],
  logoCloud: [
    { label: "Grid", value: "grid" },
    { label: "Fila", value: "row" },
  ],
  team: [
    { label: "Grid", value: "grid" },
    { label: "Cards", value: "cards" },
  ],
  stats: [
    { label: "Numeros grandes", value: "big-numbers" },
    { label: "Cards", value: "cards" },
    { label: "Inline", value: "inline" },
  ],
  pricing: [
    { label: "Cards", value: "cards" },
    { label: "Tabla", value: "table" },
  ],
  faq: [
    { label: "Accordion", value: "accordion" },
    { label: "Dos columnas", value: "two-col" },
  ],
  comparison: [
    { label: "Tabla", value: "table" },
    { label: "Cards", value: "cards" },
  ],
  timeline: [
    { label: "Vertical", value: "vertical" },
    { label: "Steps", value: "steps" },
    { label: "Horizontal", value: "horizontal" },
  ],
  gallery: [
    { label: "Grid", value: "grid" },
    { label: "Masonry", value: "masonry" },
  ],
};
