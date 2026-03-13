import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { currentDateLine } from "../streamCore";

const SVG_SYSTEM_PROMPT = `You are a professional SVG designer. Generate clean, compact SVG graphics for documents.

STRICT SIZE RULES:
- ALWAYS use viewBox="0 0 600 300" (2:1 ratio) — no exceptions
- ALWAYS set width="100%" height="auto" — NEVER use fixed pixel width/height
- NO internal padding or margins — content fills the viewBox edge-to-edge (leave only 10-20px padding)
- Keep SVGs under 2KB — simplicity is key

STYLE RULES:
- Output ONLY the <svg>...</svg> tag — no markdown, no explanation
- Flat design: solid fills, no drop shadows, minimal gradients (max 1-2)
- Max 8-10 elements total — prefer fewer, larger shapes over many small ones
- Color palette: use the provided theme colors, or defaults (#6366f1, #8b5cf6, #ec4899, #14b8a6, #f59e0b)
- Text: font-family="system-ui, sans-serif", font-size 12-16px, max 5 text labels
- Self-contained: no external references, all styles inline

CHART TYPES:
- Bar charts (vertical/horizontal) — max 6 bars, rounded caps
- Pie/donut charts — max 5 segments
- Line charts — smooth paths, max 8 data points
- Progress/gauge charts
- Simple comparison charts
- Stat cards with visual elements

AVOID: complex illustrations, many small elements, decorative borders, nested groups deeper than 2 levels.`;


export async function generateSvg(
  prompt: string,
  anthropicApiKey?: string,
  options?: { width?: number; height?: number; themeColors?: string }
): Promise<string> {
  const apiKey = anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  const anthropic = createAnthropic({ apiKey: apiKey || undefined });

  const sizeHint = options?.width && options?.height
    ? ` Target dimensions: ${options.width}x${options.height}px.`
    : "";
  const colorHint = options?.themeColors
    ? ` Use these theme colors: ${options.themeColors}.`
    : "";

  const result = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: SVG_SYSTEM_PROMPT + currentDateLine(),
    messages: [
      {
        role: "user",
        content: `Generate an SVG for: ${prompt}${sizeHint}${colorHint}`,
      },
    ],
    maxOutputTokens: 2000,
  });

  // Extract just the SVG tag
  const svgMatch = result.text.match(/<svg[\s\S]*<\/svg>/i);
  if (!svgMatch) {
    throw new Error("SVG generation failed — no <svg> tag in response");
  }

  return svgMatch[0];
}
