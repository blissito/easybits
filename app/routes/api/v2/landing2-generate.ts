import type { Route } from "./+types/landing2-generate";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { nanoid } from "nanoid";
import { LANDING_SYSTEM_PROMPT } from "~/lib/landingPrompts";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import type { LandingBlock, BlockType } from "~/lib/landing2/blockTypes";

const VALID_TYPES = new Set<string>(["hero", "text", "imageText", "cta", "footer"]);

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

Create 4-6 blocks. Always start with "hero" and end with "footer". All text in Spanish.

Example:
{
  "blocks": [
    { "type": "hero", "content": { "headline": "...", "subtitle": "...", "ctaText": "...", "ctaUrl": "#" } },
    { "type": "text", "content": { "title": "...", "body": "<p>...</p>" } },
    { "type": "imageText", "content": { "title": "...", "body": "...", "imageUrl": "https://placehold.co/600x400", "imagePosition": "right" } },
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
