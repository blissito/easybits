import type { Route } from "./+types/landing3-refine";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import { enrichImages } from "~/.server/images/enrichImages";
import type { Section3 } from "~/lib/landing3/types";

const REFINE_SYSTEM = `You are an expert HTML/Tailwind CSS developer. You receive the current HTML of a landing page section and a user instruction.

RULES:
- Return ONLY the modified HTML — no full page, no <html>/<head>/<body> tags
- Use Tailwind CSS classes (CDN loaded)
- You may use inline styles for specific adjustments
- Images: use data-image-query="english search query" for new images
- Keep all text in its original language unless asked to translate
- Be creative — don't just make minimal changes, improve the design
- Return raw HTML only — no markdown fences, no explanations`;

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json();
  const { landingId, sectionId, instruction, currentHtml, referenceImage } =
    body;

  if (!landingId || !sectionId || !instruction) {
    return Response.json(
      { error: "landingId, sectionId, and instruction required" },
      { status: 400 }
    );
  }

  const landing = await db.landing.findUnique({ where: { id: landingId } });
  if (!landing || landing.ownerId !== ctx.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const sections = (landing.sections || []) as unknown as Section3[];
  const isNewSection = sectionId === "__new__";
  const section = isNewSection ? null : sections.find((s) => s.id === sectionId);
  if (!isNewSection && !section) {
    return Response.json({ error: "Section not found" }, { status: 404 });
  }

  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const anthropic = userKey
    ? createAnthropic({ apiKey: userKey })
    : createAnthropic();

  const model = anthropic("claude-sonnet-4-6");

  // Build content (supports multimodal with reference image)
  const content: any[] = [];
  if (referenceImage) {
    content.push({ type: "image", image: referenceImage });
  }
  content.push({
    type: "text",
    text: `Current HTML:\n${currentHtml || section?.html || "<section></section>"}\n\nInstruction: ${instruction}\n\nReturn the updated HTML.`,
  });

  const result = await generateText({
    model,
    system: REFINE_SYSTEM,
    messages: [{ role: "user", content }],
  });

  let html = result.text.trim();
  if (html.startsWith("```")) {
    html = html.replace(/^```(?:html|xml)?\s*/, "").replace(/\s*```$/, "");
  }

  // Enrich images (data-image-query + fake URLs fallback)
  html = await enrichImages(html);

  // Update section in DB (skip for new sections — editor handles that)
  if (!isNewSection) {
    const updatedSections = sections.map((s) =>
      s.id === sectionId ? { ...s, html } : s
    );
    await db.landing.update({
      where: { id: landingId },
      data: { sections: updatedSections as any },
    });
  }

  return Response.json({ html });
}
