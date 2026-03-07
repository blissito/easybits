import type { Route } from "./+types/landing2-generate";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { nanoid } from "nanoid";
import { LANDING_SYSTEM_PROMPT } from "~/lib/landingPrompts";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import type { LandingBlock, BlockType } from "~/lib/landing2/blockTypes";

const VALID_TYPES = new Set<string>([
  "hero", "text", "imageText", "cta", "footer",
  "features", "callout", "video", "testimonials", "logoCloud", "team",
  "stats", "pricing", "faq", "comparison", "chart", "diagram", "timeline", "gallery",
]);

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json();
  const { landingId, prompt, theme } = body;

  if (!landingId || !prompt) {
    return Response.json(
      { error: "landingId and prompt required" },
      { status: 400 }
    );
  }

  const landing = await db.landing.findUnique({ where: { id: landingId } });
  if (!landing || landing.ownerId !== ctx.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const anthropic = userKey
    ? createAnthropic({ apiKey: userKey })
    : createAnthropic();

  const model = anthropic("claude-haiku-4-5-20251001");

  const result = await generateText({
    model,
    system: LANDING_SYSTEM_PROMPT,
    prompt: `Generate a landing page using BLOCKS for: ${prompt}
Style: ${theme || "modern"}

Respond with a JSON object containing a "blocks" array. Each block has "type" and "content".

Available block types and their content:
- hero: { headline, subtitle, ctaText, ctaUrl, imageUrl? }
- text: { title, body } (body is HTML string with <p>, <strong>, <em>, <ul>, <li>)
- imageText: { title, body, imageUrl, imagePosition ("left"|"right") }
- cta: { headline, subtitle, ctaText, ctaUrl }
- footer: { companyName, links: [{label, url}] }
- features: { title, subtitle, variant ("cards"|"cards-icon"|"bordered"|"minimal"), columns (2|3|4), items: [{icon, title, desc}] }
- callout: { type ("info"|"warning"|"success"|"question"), title, body }
- video: { title, videoUrl (YouTube/Vimeo URL), description }
- testimonials: { title, variant ("cards"|"quote-large"), items: [{quote, author, role, avatarUrl?}] }
- logoCloud: { title, variant ("grid"|"row"), logos: [{imageUrl, alt, url}] }
- team: { title, variant ("grid"|"cards"), members: [{name, role, imageUrl, bio?}] }
- stats: { title, variant ("big-numbers"|"cards"|"inline"), items: [{value, label, desc?}] }
- pricing: { title, variant ("cards"|"table"), plans: [{name, price, period, features: [string], ctaText, highlighted: bool}] }
- faq: { title, variant ("accordion"|"two-col"), items: [{question, answer}] }
- comparison: { title, headers: [string], rows: [{label, values: [string]}], highlightCol: number }
- chart: { title, chartType ("bar"|"line"|"pie"|"doughnut"|"area"), labels: [string], datasets: [{label, data: [number], color?}] }
- diagram: { title, diagramType ("funnel"|"venn"|"roadmap"|"puzzle"|"versus"|"target"|"pyramid"|"cycle"), items: [{label, value?, color?}] }
- timeline: { title, variant ("vertical"|"steps"|"horizontal"), events: [{date, title, desc}] }
- gallery: { title, variant ("grid"|"masonry"), columns (2|3|4), images: [{url, alt, caption?}] }

Create 6-10 blocks. Always start with "hero" and end with "footer". Use diverse block types — don't just use hero+text+cta+footer. Include at least 2-3 of the richer blocks (features, stats, testimonials, pricing, faq, etc.) based on the prompt context. All text in Spanish.

Example:
{
  "blocks": [
    { "type": "hero", "content": { "headline": "...", "subtitle": "...", "ctaText": "...", "ctaUrl": "#" } },
    { "type": "features", "content": { "title": "...", "subtitle": "...", "variant": "cards-icon", "columns": 3, "items": [{"icon": "⚡", "title": "...", "desc": "..."}] } },
    { "type": "stats", "content": { "title": "...", "variant": "big-numbers", "items": [{"value": "10K+", "label": "..."}] } },
    { "type": "testimonials", "content": { "title": "...", "variant": "cards", "items": [{"quote": "...", "author": "...", "role": "..."}] } },
    { "type": "pricing", "content": { "title": "...", "variant": "cards", "plans": [{"name": "...", "price": "$0", "period": "/mes", "features": ["..."], "ctaText": "...", "highlighted": false}] } },
    { "type": "faq", "content": { "title": "...", "variant": "accordion", "items": [{"question": "...", "answer": "..."}] } },
    { "type": "cta", "content": { "headline": "...", "subtitle": "...", "ctaText": "..." } },
    { "type": "footer", "content": { "companyName": "...", "links": [{"label": "Inicio", "url": "#"}] } }
  ]
}

Return ONLY valid JSON, no markdown fences.`,
  });

  let raw = result.text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: "Failed to parse AI response", raw },
      { status: 502 }
    );
  }

  if (!parsed.blocks || !Array.isArray(parsed.blocks)) {
    return Response.json(
      { error: "Invalid AI response: missing blocks array", raw: parsed },
      { status: 502 }
    );
  }

  const blocks: LandingBlock[] = parsed.blocks
    .filter((b: any) => b.type && VALID_TYPES.has(b.type))
    .map((b: any, i: number) => ({
      id: nanoid(8),
      type: b.type as BlockType,
      order: i,
      content: b.content || {},
    }));

  await db.landing.update({
    where: { id: landingId },
    data: { sections: blocks as any },
  });

  return Response.json({ blocks });
}
