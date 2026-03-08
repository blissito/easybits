import type { Route } from "./+types/landing3-generate";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { nanoid } from "nanoid";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import { findImageSlots } from "~/.server/images/enrichImages";
import { searchImage } from "~/.server/images/pexels";
import type { Section3 } from "~/lib/landing3/types";

const SYSTEM_PROMPT = `You are an elite web designer. You generate stunning, creative HTML+Tailwind CSS sections for landing pages.

RULES:
- Each section is a complete <section> tag with Tailwind CSS classes
- Use Tailwind CDN classes ONLY (no custom CSS, no @apply, no @import, no @tailwind directives)
- Design must be creative, modern, and visually striking — NOT generic Bootstrap-like layouts
- Use creative gradients, asymmetric layouts, overlapping elements, subtle animations via Tailwind classes
- Images: NEVER use src with fake/placeholder URLs. Instead use <img data-image-query="english search query" alt="description" class="..."/> — the system will auto-replace data-image-query with a real src. Do NOT include a src attribute when using data-image-query.
- Responsive: mobile-first with sm/md/lg/xl breakpoints
- NO JavaScript, only HTML+Tailwind
- Each section must be independent and self-contained
- Use real-looking content (not Lorem ipsum) — make it specific to the prompt
- All text content in Spanish unless the prompt specifies otherwise

COLOR SYSTEM — CRITICAL:
- Use semantic color classes: bg-primary, text-primary, bg-primary-light, bg-primary-dark, text-on-primary, bg-surface, bg-surface-alt, text-on-surface, text-on-surface-muted, bg-secondary, text-secondary, bg-accent, text-accent
- NEVER use hardcoded Tailwind color classes like bg-indigo-600, text-blue-500, bg-purple-700, etc.
- Only use gray-* for subtle borders and dividers (e.g. border-gray-200). All main colors MUST use semantic tokens.
- For gradients use semantic colors: from-primary to-primary-dark, from-surface to-surface-alt, etc.
- For hover states: hover:bg-primary-dark, hover:bg-primary-light, etc.

HERO SECTION — MUST be impressive:
- Use a bento-grid or asymmetric layout: large headline block on the left, smaller stat/metric cards on the right
- Include real-looking social proof: "2,847+ users", avatar stack, star ratings, trust badges
- Use a bold, oversized headline (text-5xl/6xl/7xl font-black) with tight line height (leading-none or leading-tight)
- Add a subtitle with a tag/breadcrumb above the headline (e.g. "NO-CODE · DISEÑO · FUTURO")
- Include 2 CTAs: one primary (bg-primary, large, with arrow →) and one secondary (outlined/ghost)
- Add a real image with data-image-query relevant to the product/service
- Use overlapping elements, rounded-2xl cards, subtle shadows, and depth via layering
- The hero should feel like a premium SaaS dashboard, NOT a generic centered headline
- Min height: min-h-[80vh] or min-h-screen with good vertical padding

TAILWIND v3 NOTES:
- Standard Tailwind v3 classes (shadow-sm, shadow-md, rounded-md, etc.)
- Borders: border + border-gray-200 for visible borders`;

const PROMPT_SUFFIX = `

OUTPUT FORMAT: NDJSON — one JSON object per line, NO wrapper array, NO markdown fences.
Each line: {"label": "Section Name", "html": "<section class='...'>...</section>"}

Generate 6-10 sections. Always start with a Hero and end with a Footer.
Make each section visually distinct. Use creative layouts — not everything needs to be centered with max-w-7xl.
Think like a premium design agency.`;

/**
 * Extract complete JSON objects from accumulated text using brace-depth tracking.
 */
function extractJsonObjects(text: string): [any[], string] {
  const objects: any[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    remaining = remaining.trimStart();
    if (!remaining.startsWith("{")) {
      const nextBrace = remaining.indexOf("{");
      if (nextBrace === -1) break;
      remaining = remaining.slice(nextBrace);
      continue;
    }

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

    if (end === -1) break;

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
  const { landingId, prompt, referenceImage, extraInstructions } = body;

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

  const model = anthropic("claude-sonnet-4-6");

  // Build prompt content (supports multimodal with reference image)
  const extra = extraInstructions ? `\n\nAdditional instructions: ${extraInstructions}` : "";
  const content: any[] = [];
  if (referenceImage) {
    content.push({
      type: "image",
      image: referenceImage,
    });
    content.push({
      type: "text",
      text: `Generate a landing page inspired by this reference image for: ${prompt}${extra}${PROMPT_SUFFIX}`,
    });
  } else {
    content.push({
      type: "text",
      text: `Generate a landing page for: ${prompt}${extra}${PROMPT_SUFFIX}`,
    });
  }

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  const allSections: Section3[] = [];
  const imagePromises: Promise<void>[] = [];
  let sectionOrder = 0;
  let buffer = "";

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: any) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        for await (const chunk of result.textStream) {
          buffer += chunk;

          const [objects, remaining] = extractJsonObjects(buffer);
          buffer = remaining;

          for (const obj of objects) {
            if (!obj.html || !obj.label) continue;

            const section: Section3 = {
              id: nanoid(8),
              order: sectionOrder++,
              html: obj.html,
              label: obj.label,
            };

            allSections.push(section);
            send("section", section);

            // Enrich images with Pexels (non-blocking per section)
            const slots = findImageSlots(section.html);
            if (slots.length > 0) {
              const sectionRef = section;
              const slotsSnapshot = slots.map((s) => ({ ...s }));
              imagePromises.push(
                (async () => {
                  const results = await Promise.allSettled(
                    slotsSnapshot.map(async (slot) => {
                      const img = await searchImage(slot.query).catch(() => null);
                      const url = img?.url || `https://placehold.co/800x500/1f2937/9ca3af?text=${encodeURIComponent(slot.query.slice(0, 30))}`;
                      return { slot, url };
                    })
                  );
                  let html = sectionRef.html;
                  for (const r of results) {
                    if (r.status === "fulfilled" && r.value) {
                      const { slot, url } = r.value;
                      const replacement = slot.replaceStr.replace("{url}", url);
                      html = html.replaceAll(slot.searchStr, replacement);
                    }
                  }
                  if (html !== sectionRef.html) {
                    sectionRef.html = html;
                    send("section-update", { id: sectionRef.id, html });
                  }
                })()
              );
            }
          }
        }

        // Parse remaining buffer
        if (buffer.trim()) {
          let cleaned = buffer.trim();
          if (cleaned.startsWith("```")) {
            cleaned = cleaned
              .replace(/^```(?:json)?\s*/, "")
              .replace(/\s*```$/, "");
          }
          const [lastObjects] = extractJsonObjects(cleaned);
          for (const obj of lastObjects) {
            if (!obj.html || !obj.label) continue;
            const section: Section3 = {
              id: nanoid(8),
              order: sectionOrder++,
              html: obj.html,
              label: obj.label,
            };
            allSections.push(section);
            send("section", section);
          }
        }

        // Wait for image enrichment
        await Promise.allSettled(imagePromises);

        // Save to DB
        if (allSections.length > 0) {
          await db.landing.update({
            where: { id: landingId },
            data: { sections: allSections as any },
          });
        }

        send("done", { total: allSections.length });
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
