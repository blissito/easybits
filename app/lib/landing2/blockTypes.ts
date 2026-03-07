export type BlockType = "hero" | "text" | "imageText" | "cta" | "footer";

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
};

export const BLOCK_ICONS: Record<BlockType, string> = {
  hero: "🎯",
  text: "📝",
  imageText: "🖼️",
  cta: "🚀",
  footer: "📋",
};

export const ALL_BLOCK_TYPES: BlockType[] = [
  "hero",
  "text",
  "imageText",
  "cta",
  "footer",
];
