import { generateObject, streamText } from "ai";
import { z } from "zod";
import { nanoid } from "nanoid";
import { resolveModel, currentDateLine } from "./streamCore";

/**
 * Premium layout recipes inspired by Gamma. Each recipe is a tight description
 * of structure + content discipline + visual rhythm — the AI follows it as a
 * spec instead of inventing a layout from scratch. Use via `direction.layoutPreset`.
 */
export const GAMMA_LAYOUTS: Record<string, string> = {
  cover:
    "Full-bleed cover. Document title (huge, max 6 words), one-line subtitle (max 12 words), date or author in small caps. Generous whitespace; no body text. Optional accent shape or full-bleed editorial image with dark overlay.",
  "section-divider":
    "Chapter break. Section number (small) + section title (huge, single line) + one-sentence intent. 70%+ whitespace. No bullets, no images.",
  agenda:
    "Numbered list of 3-7 sections. Each row: number (large), section title (medium), one-line description (muted). Minimal decoration, strong vertical rhythm.",
  "big-statement":
    "Single huge headline (display type, 8-15 words max), one supporting line below in body color. Center-aligned. No bullets, no images. The page is the statement.",
  "one-big-stat":
    "ONE massive number/percentage (display, takes 50%+ of vertical space) + short label below + one-line implication ('what this means'). NEVER more than one stat. Background can use primary color with on-primary text.",
  "stat-grid":
    "3 or 4 stats in a grid. Each cell: number (large), label (small caps), one-line implication (muted). Equal weight; the grid IS the page. No paragraphs.",
  "two-column":
    "50/50 split. Left: headline + 2-4 short paragraphs OR 3-5 disciplined bullets (max 15 words each, active voice). Right: visual (image, icon list, key stat, or pull-quote). Vertical center alignment.",
  "three-column":
    "Three parallel ideas (e.g. before/during/after, problem/insight/solution, past/present/future). Each column: small icon or number, title, one short paragraph. Equal heights, equal visual weight.",
  "image-full-bleed":
    "Full-bleed editorial image with dark overlay (bg-black/40 to bg-black/60). Headline (large, white) + one-line caption sit bottom-left or center. No body text. Image MUST use data-image-query.",
  "image-text-split":
    "50/50 image-text split. One half: full-bleed image with object-cover. Other half: title (large) + 2-3 short paragraphs OR 3-4 bullets. No decorative clutter; the image carries the visual.",
  "bento-grid":
    "Asymmetric grid (e.g. 2x3 with one tall card and one wide card). Mix of cell types: stat card, image card, quote card, short-text card, icon card. Each cell self-contained. Use border or subtle shadow per cell.",
  "card-grid":
    "Uniform grid of 3-6 cards (3x2 or 2x3). Each card: icon or small number, title (medium), one-line description. Equal heights. Use the direction's borderRadius and shadows tokens.",
  "comparison-table":
    "Vs / comparison layout. Two or three columns side by side, each with a title and 4-6 rows of features/attributes. Use accent color to highlight the recommended/winning column. Plain rows; no zebra stripes unless density is dense-editorial.",
  "timeline-vertical":
    "Chronological events stacked vertically. Each event: date/step (left, accent color), title (medium), one short paragraph. Connecting line on the left. 4-7 events max.",
  "process-steps":
    "Numbered horizontal or vertical steps with arrows or chevrons between them. Each step: large number, title, one-line description. 3-5 steps. Equal sizing.",
  quote:
    "Centered pull-quote. Huge serif type (or display sans if mood is vibrant), 12-25 words. Attribution below in small caps with author name + role. Plenty of whitespace; optional small portrait on the side.",
  "closing-cta":
    "Final page. Big headline ('what's next', 'thank you', or strong CTA), one-line subtitle, contact info or call-to-action button styling, optional small logo. Generous whitespace; mirror the cover's energy.",
};

export const DesignDirectionSchema = z.object({
  name: z.string().describe("Creative direction name, e.g. 'The Editorial'"),
  tagline: z
    .string()
    .describe("One-line vibe description, e.g. 'Bold serif typography meets minimalist space'"),
  headingFont: z
    .string()
    .describe("Google Font name for headings, e.g. 'Playfair Display'"),
  bodyFont: z
    .string()
    .describe("Google Font name for body text, e.g. 'Inter'"),
  colors: z.object({
    primary: z.string().describe("Main brand color as hex, e.g. '#6366f1'"),
    accent: z.string().describe("Accent/CTA color as hex, e.g. '#f59e0b'"),
    surface: z.string().describe("Background surface color as hex, e.g. '#ffffff'"),
    surfaceAlt: z.string().describe("Alt surface (cards, alternating sections) as hex, e.g. '#f8fafc'"),
    text: z.string().describe("Main text color as hex, e.g. '#0f172a'"),
  }),
  mood: z.enum(["dark", "light", "warm", "cool", "vibrant"]),
  layoutHint: z
    .string()
    .describe("Layout archetype: 'split-screen', 'editorial', 'immersive-gallery', 'community-feed', 'bento-grid', 'magazine'"),

  // --- Gamma-style premium layout preset ---
  layoutPreset: z
    .enum([
      "cover",
      "section-divider",
      "agenda",
      "big-statement",
      "one-big-stat",
      "stat-grid",
      "two-column",
      "three-column",
      "image-full-bleed",
      "image-text-split",
      "bento-grid",
      "card-grid",
      "comparison-table",
      "timeline-vertical",
      "process-steps",
      "quote",
      "closing-cta",
    ])
    .optional()
    .describe("Premium layout preset (Gamma-style). When set, the AI follows that exact layout recipe instead of inventing a layout from scratch."),

  // --- Enriched fields (community-valued) ---
  audience: z
    .string()
    .optional()
    .describe("Target audience, e.g. 'C-level executives', 'technical PMs', 'Gen Z gamers'"),
  voice: z
    .string()
    .optional()
    .describe("Tone of voice, e.g. 'authoritative and concise', 'warm and inviting', 'playful'"),
  typographyScale: z
    .object({
      h1: z.string().optional(),
      h2: z.string().optional(),
      h3: z.string().optional(),
      body: z.string().optional(),
      label: z.string().optional(),
      caption: z.string().optional(),
    })
    .optional()
    .describe("Mandatory pixel sizes per role (h1, h2, h3, body, label, caption) — forces typographic consistency across all pages. Use exact strings like '96px', '6rem', '13px uppercase tracking-wide'"),
  density: z
    .enum(["spacious", "comfortable", "compact", "dense-editorial"])
    .optional()
    .describe("Content density: spacious=lots of whitespace, dense-editorial=newspaper-style"),
  borderRadius: z
    .enum(["sharp", "soft", "rounded", "pill"])
    .optional()
    .describe("Corner radius: sharp=0, soft=4-6px, rounded=12-16px, pill=999px"),
  shadows: z
    .enum(["none", "subtle", "soft", "dramatic"])
    .optional()
    .describe("Shadow style across cards/elements"),
  imageryStyle: z
    .string()
    .optional()
    .describe("Imagery rules, e.g. 'editorial photography only, no clipart'"),
  contentDiscipline: z
    .string()
    .optional()
    .describe("Content rules, e.g. 'max 15 words per bullet, active voice'"),
  referenceBrands: z
    .array(z.string())
    .optional()
    .describe("Brands to take design cues from, e.g. ['Stripe', 'Linear']"),
  customInstructions: z
    .string()
    .optional()
    .describe("Free-form styling instructions appended to the prompt"),
});

export type DesignDirection = z.infer<typeof DesignDirectionSchema>;

export interface DirectionsOptions {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  prompt: string;
  count?: number;
  /** "landing" generates hero sections, "document" generates cover pages */
  product?: "landing" | "document";
  /** Override the model ID or pass a pre-built LanguageModel object */
  model?: string | import("ai").LanguageModel;
}

const DIRECTIONS_SYSTEM = `You are an elite creative director at a top design agency (Pentagram, Sagmeister, Collins).

Given a project brief, propose design directions that are MAXIMALLY diverse from each other.

RULES:
- Each direction must feel like a completely DIFFERENT design agency made it
- Vary these axes: typography style (geometric sans, humanist sans, serif, slab, display/decorative), color mood (dark, light, warm, cool, vibrant), layout approach (editorial, split-screen, immersive, bento-grid, community)
- Fonts MUST be popular Google Fonts that render well. Good examples:
  SANS: Inter, DM Sans, Space Grotesk, Outfit, Plus Jakarta Sans, Manrope, Sora, Figtree, Urbanist
  SERIF: Playfair Display, Lora, Merriweather, Source Serif 4, Cormorant Garamond, Libre Baskerville, DM Serif Display
  DISPLAY: Bebas Neue, Oswald, Archivo Black, Righteous, Anton, Alfa Slab One
  MONO: JetBrains Mono, Space Mono, IBM Plex Mono
- NEVER use the same heading font twice
- NEVER use the same color palette twice
- AT LEAST one direction must be dark-mode
- AT LEAST one must use serif headings
- AT LEAST one must be bold/editorial with huge typography
- AT LEAST one layoutHint must include "photo" (e.g. "split-screen-photo", "immersive-gallery") — this tells the preview generator to use a real image
- Colors must be cohesive palettes, not random. Think Dribbble-worthy.
- Names should be evocative ("The Chronicle", "Neon Pulse", "Warm Atelier")`;

/**
 * Generate N design directions for a landing page.
 * Uses generateObject for type-safe structured output.
 */
export async function generateDirections(
  options: DirectionsOptions
): Promise<DesignDirection[]> {
  const { prompt, count = 4, openaiApiKey, anthropicApiKey, model: modelId } = options;

  const model = await resolveModel({
    openaiApiKey,
    anthropicApiKey,
    modelId,
    defaultOpenai: "gpt-4o-mini",
    defaultAnthropic: "claude-haiku-4-5-20251001",
  });

  const { object } = await generateObject({
    model,
    schema: z.object({
      directions: z.array(DesignDirectionSchema).describe(`Exactly ${count} design directions`),
    }),
    system: DIRECTIONS_SYSTEM + currentDateLine(),
    prompt: `Project brief: "${prompt}"

Generate ${count} design directions. Make them as visually distinct as possible.`,
  });

  return object.directions;
}

/**
 * Generate a hero section preview for a given design direction.
 * Fast Haiku call, returns raw HTML string with Google Fonts link.
 */
export async function generateHeroPreview(options: {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  prompt: string;
  direction: DesignDirection;
  product?: "landing" | "document";
  /** Override model ID or pass a pre-built LanguageModel object */
  model?: string | import("ai").LanguageModel;
  /** Called with partial HTML as it streams in */
  onChunk?: (partialHtml: string) => void;
  /** Reference image data URL — AI will replicate this design style */
  referenceImage?: string;
}): Promise<string> {
  const { prompt, direction, anthropicApiKey, openaiApiKey, product = "landing", model: modelId, onChunk, referenceImage } = options;

  const model = await resolveModel({
    openaiApiKey,
    anthropicApiKey,
    modelId,
    defaultOpenai: "gpt-4o-mini",
    defaultAnthropic: "claude-haiku-4-5-20251001",
  });

  const fontsUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(direction.headingFont).replace(/%20/g, "+")}:wght@400;700;900&family=${encodeURIComponent(direction.bodyFont).replace(/%20/g, "+")}:wght@400;500;600&display=swap`;

  const isDocument = product === "document";

  const systemPrompt = isDocument
    ? `You create stunning document cover pages with HTML + Tailwind CSS.
Output ONLY the raw HTML — no markdown fences, no explanation.
The HTML must include a <link> tag for Google Fonts and a <section> tag.
This is a LETTER-SIZE document cover page (8.5" × 11"), NOT a website hero.
Use the EXACT fonts and colors provided. The cover must feel premium and print-ready.
Use real-looking content specific to the brief (Spanish text).

CRITICAL — TEXT MUST BE VISIBLE AND READABLE:
- The document title MUST be large (text-4xl or bigger), bold, and clearly visible
- Include: document title, subtitle or description, date, optional author/company name
- ALL text must have strong contrast against its background — if background is dark, text MUST be white/light
- NEVER let text disappear into the background

DESIGN APPROACHES (vary across directions):
- Approach A: Solid color background (bg-[primary]) with large white text — NO image needed
- Approach B: Split layout — image on one half, text on solid color half
- Approach C: Full-bleed image WITH a solid overlay (bg-black/50 or bg-[primary]/80) AND white text on top
- Approach D: Geometric/abstract design with color blocks, no image
- If the layout hint contains "photo", you MUST use Approach B or C (with a real image).
- Otherwise, choose the approach that best fits the mood. NOT every cover needs a full-bleed image.

If using images:
- Pattern: <img data-image-query="specific english search query" alt="description" class="absolute inset-0 w-full h-full object-cover"/>
- ALWAYS add a dark overlay on top: <div class="absolute inset-0 bg-black/50"></div>
- Text goes ABOVE the overlay with z-10 and text-white
- NEVER include a src attribute — ONLY data-image-query

NO buttons or CTAs — this is a print document cover.
NO emoji — use geometric shapes or SVG icons for decoration.`
    : `You create stunning hero sections with HTML + Tailwind CSS.
Output ONLY the raw HTML — no markdown fences, no explanation.
The HTML must include a <link> tag for Google Fonts and a <section> tag.
Use the EXACT fonts and colors provided. The hero must feel premium and polished.
Use real-looking content specific to the brief (Spanish text).
Include: headline (huge), subtitle, 1-2 CTAs, and optionally a hero image via <img data-image-query="..." alt="..." class="...">.
NEVER use src on img tags. Use data-image-query with English search terms.`;

  const sectionInstruction = isDocument
    ? `Generate a document cover page. Use inline style for font-family referencing the Google Fonts.
Start with: <link href="${fontsUrl}" rel="stylesheet">
Then a <section class="w-[8.5in] h-[11in] relative overflow-hidden"> sized for letter paper.
Use the exact hex colors in Tailwind arbitrary values like bg-[${direction.colors.primary}] text-[${direction.colors.text}] etc.
Use full-bleed backgrounds, geometric accents, elegant typography hierarchy.
Make it look like a $50K design agency document cover.`
    : `Generate a hero section. Use inline style for font-family referencing the Google Fonts.
Start with: <link href="${fontsUrl}" rel="stylesheet">
Then a <section> with min-h-[80vh].
Use the exact hex colors in Tailwind arbitrary values like bg-[${direction.colors.primary}] text-[${direction.colors.text}] etc.
Make it look like a $50K agency landing page hero.`;

  const textPrompt = `Brief: "${prompt}"

Design direction: "${direction.name}" — ${direction.tagline}
Layout: ${direction.layoutHint}
Heading font: ${direction.headingFont}
Body font: ${direction.bodyFont}
Colors: primary=${direction.colors.primary}, accent=${direction.colors.accent}, surface=${direction.colors.surface}, surfaceAlt=${direction.colors.surfaceAlt}, text=${direction.colors.text}
Mood: ${direction.mood}

${sectionInstruction}`;

  const messages: any[] = [{
    role: "user" as const,
    content: referenceImage
      ? [
          { type: "image" as const, image: referenceImage },
          { type: "text" as const, text: `Replicate the visual design style, layout, and aesthetic from the reference image above.\n\n${textPrompt}` },
        ]
      : textPrompt,
  }];

  const result = streamText({
    model,
    system: systemPrompt + currentDateLine(),
    messages,
  });

  let html = "";
  let chunkCount = 0;
  for await (const chunk of result.textStream) {
    html += chunk;
    chunkCount++;
    if (onChunk && chunkCount % 3 === 0) {
      onChunk(html);
    }
  }
  if (onChunk) onChunk(html);

  // Clean markdown fences if present
  html = html.trim();
  if (html.startsWith("```")) {
    html = html.replace(/^```(?:html|xml)?\s*/, "").replace(/\s*```$/, "");
  }

  return html;
}
