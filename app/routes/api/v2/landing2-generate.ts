import type { Route } from "./+types/landing2-generate";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { nanoid } from "nanoid";
import { LANDING_SYSTEM_PROMPT } from "~/lib/landingPrompts";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import type { LandingBlock, BlockType } from "~/lib/landing2/blockTypes";
import { searchImage } from "~/.server/images/pexels";

const IMAGE_BLOCK_TYPES = new Set(["hero", "imageText"]);

const VALID_TYPES = new Set<string>([
  "hero", "text", "imageText", "cta", "footer",
  "features", "callout", "video", "testimonials", "logoCloud", "team",
  "stats", "pricing", "faq", "comparison", "chart", "diagram", "timeline", "gallery",
]);

const PROMPT_SUFFIX = `

Respond with a JSON object containing a "blocks" array. Each block has "type" and "content".

Available block types and their content:
- hero: { headline, subtitle, ctaText, ctaUrl, imageSearchQuery } (imageSearchQuery: SHORT English keywords for stock photo search, e.g. "modern office workspace", "team collaboration")
- text: { title, body } (body is HTML string with <p>, <strong>, <em>, <ul>, <li>)
- imageText: { title, body, imageSearchQuery, imagePosition ("left"|"right") } (imageSearchQuery: SHORT English keywords for stock photo)
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

Create 6-10 blocks. Always start with "hero" and end with "footer". All text in Spanish.

DIVERSITY RULES (strictly follow):
- Use at least 4 DIFFERENT block types between hero and footer. Do NOT repeat the same block type.
- Do NOT use more than 2 "text" blocks. Prefer richer blocks like features, stats, testimonials, pricing, faq, timeline, gallery, comparison, or diagram.
- ALWAYS include "imageSearchQuery" in hero and imageText blocks — it is REQUIRED, not optional.
- Use visual variants when available: e.g. features "cards-icon" or "bordered", stats "cards" or "inline", testimonials "quote-large", faq "two-col", timeline "steps", gallery "masonry". Do NOT always use the default variant — vary them.

IMPORTANT: Output each block as a COMPLETE JSON object on its own line (NDJSON format). Do NOT wrap in an outer object or array. Each line must be a valid JSON object like:
{"type": "hero", "content": {"headline": "...", "subtitle": "...", "ctaText": "...", "ctaUrl": "#"}}
{"type": "features", "content": {"title": "...", "items": [...]}}

No markdown fences, no trailing commas, no wrapper. One valid JSON object per line.`;

/**
 * Extract complete JSON objects from accumulated text.
 * Returns [extractedObjects[], remainingText]
 */
function extractJsonObjects(text: string): [any[], string] {
  const objects: any[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    remaining = remaining.trimStart();
    if (!remaining.startsWith("{")) {
      // Skip non-JSON prefixes (markdown fences, commas, brackets, whitespace)
      const nextBrace = remaining.indexOf("{");
      if (nextBrace === -1) break;
      remaining = remaining.slice(nextBrace);
      continue;
    }

    // Try to find a complete JSON object by tracking brace depth
    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;

    for (let i = 0; i < remaining.length; i++) {
      const ch = remaining[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
    }

    if (end === -1) break; // incomplete object, wait for more data

    const candidate = remaining.slice(0, end + 1);
    remaining = remaining.slice(end + 1);

    try {
      objects.push(JSON.parse(candidate));
    } catch {
      // malformed, skip
    }
  }

  return [objects, remaining];
}

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

  const result = streamText({
    model,
    system: LANDING_SYSTEM_PROMPT,
    prompt: `Generate a landing page using BLOCKS for: ${prompt}\nStyle: ${theme || "modern"}${PROMPT_SUFFIX}`,
  });

  const allBlocks: LandingBlock[] = [];
  const imagePromises: Promise<void>[] = [];
  let blockOrder = 0;
  let buffer = "";

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        for await (const chunk of result.textStream) {
          buffer += chunk;

          const [objects, remaining] = extractJsonObjects(buffer);
          buffer = remaining;

          for (const obj of objects) {
            if (!obj.type || !VALID_TYPES.has(obj.type)) continue;

            const block: LandingBlock = {
              id: nanoid(8),
              type: obj.type as BlockType,
              order: blockOrder++,
              content: obj.content || {},
            };

            allBlocks.push(block);
            send("block", block);

            // Enrich with real stock image (non-blocking)
            if (IMAGE_BLOCK_TYPES.has(block.type)) {
              const query = block.content.imageSearchQuery || block.content.headline || block.content.title || prompt;
              imagePromises.push(
                searchImage(query).then((img) => {
                  if (!img) return;
                  block.content.imageUrl = img.url;
                  send("block-update", { id: block.id, content: { imageUrl: img.url } });
                }).catch(() => {})
              );
            }
          }
        }

        // Try to parse any remaining buffer
        if (buffer.trim()) {
          let cleaned = buffer.trim();
          if (cleaned.startsWith("```")) {
            cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
          }
          const [lastObjects] = extractJsonObjects(cleaned);
          for (const obj of lastObjects) {
            if (!obj.type || !VALID_TYPES.has(obj.type)) continue;
            const block: LandingBlock = {
              id: nanoid(8),
              type: obj.type as BlockType,
              order: blockOrder++,
              content: obj.content || {},
            };
            allBlocks.push(block);
            send("block", block);
          }
        }

        // Wait for image enrichment to finish
        await Promise.allSettled(imagePromises);

        // Save all blocks to DB (with enriched images)
        if (allBlocks.length > 0) {
          await db.landing.update({
            where: { id: landingId },
            data: { sections: allBlocks as any },
          });
        }

        send("done", { total: allBlocks.length });
        controller.close();
      } catch (err: any) {
        send("error", { message: err.message || "Generation failed" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
