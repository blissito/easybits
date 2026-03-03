import type { Route } from "./+types/landing-generate";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { nanoid } from "nanoid";
import { LANDING_SYSTEM_PROMPT } from "~/lib/landingPrompts";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import type { LandingSection, SectionType } from "~/lib/landingCatalog";

const VALID_TYPES = new Set<string>([
  "hero", "logoCloud", "features", "howItWorks",
  "testimonials", "pricing", "stats", "faq", "cta", "footer",
]);

// POST /api/v2/landing-generate
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
  const style = theme || "modern";

  const result = await generateText({
    model,
    system: LANDING_SYSTEM_PROMPT,
    prompt: `Generate a landing page for: ${prompt}\nStyle: ${style}\n\nRespond with a JSON object containing a "sections" array. Each section has "type" (one of: hero, logoCloud, features, howItWorks, testimonials, pricing, stats, faq, cta, footer) and its content props.

Pick 5-8 sections. Always start with "hero" and end with "footer". All text in Spanish unless the user specifies otherwise.

Example format:
{
  "sections": [
    { "type": "hero", "headline": "...", "subtitle": "...", "ctaText": "...", "ctaUrl": "#" },
    { "type": "features", "title": "...", "subtitle": "...", "items": [{ "title": "...", "description": "...", "icon": "🚀" }] },
    { "type": "footer", "companyName": "...", "links": [{ "label": "...", "url": "#" }], "socials": [{ "platform": "Twitter", "url": "#" }] }
  ]
}

Section prop schemas:
- hero: headline, subtitle, ctaText, ctaUrl
- logoCloud: title, logos[{name}]
- features: title, subtitle, items[{title, description, icon}] (3-4 items, icon is emoji)
- howItWorks: title, steps[{title, description}] (3-4 steps)
- testimonials: title, items[{quote, author, role}] (2-3 items)
- pricing: title, subtitle, tiers[{name, price, period, features[], cta, highlighted}] (2-3 tiers)
- stats: title, items[{value, label}] (3-4 items)
- faq: title, items[{question, answer}] (4-6 items)
- cta: headline, subtitle, ctaText, ctaUrl
- footer: companyName, links[{label, url}], socials[{platform, url}]

Return ONLY valid JSON, no markdown fences.`,
  });

  // Strip markdown fences if the model wraps the JSON
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

  if (!parsed.sections || !Array.isArray(parsed.sections)) {
    return Response.json(
      { error: "Invalid AI response: missing sections array", raw: parsed },
      { status: 502 }
    );
  }

  const sections: LandingSection[] = parsed.sections
    .filter((s: any) => s.type && VALID_TYPES.has(s.type))
    .map((s: any, i: number) => {
      const { type, ...props } = s;
      return {
        id: nanoid(8),
        type: type as SectionType,
        order: i,
        props,
      };
    });

  // Save to DB
  await db.landing.update({
    where: { id: landingId },
    data: { sections: sections as any },
  });

  return Response.json({ sections });
}
