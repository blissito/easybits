import type { Route } from "./+types/landing-refine-section";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { SECTION_REFINE_PROMPT } from "~/lib/landingPrompts";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import { renderSection, getThemeVars, type LandingSection } from "~/lib/landingCatalog";

// POST /api/v2/landing-refine-section
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json();
  const { landingId, sectionId, instruction } = body;

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

  const sections = (landing.sections || []) as unknown as LandingSection[];
  const section = sections.find((s) => s.id === sectionId);
  if (!section) {
    return Response.json({ error: "Section not found" }, { status: 404 });
  }

  const currentHtml = section.html || renderSection(section);

  // Resolve theme colors so the AI knows what the CSS vars mean
  const customColors = landing.customColors as { bg: string; accent: string; text: string } | null;
  const themeVars = customColors ?? getThemeVars(landing.theme || "modern");

  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const anthropic = userKey
    ? createAnthropic({ apiKey: userKey })
    : createAnthropic();

  const model = anthropic("claude-sonnet-4-6");

  const result = await generateText({
    model,
    system: SECTION_REFINE_PROMPT,
    prompt: `CSS Variables in use on this page:
--landing-bg: ${themeVars.bg}
--landing-accent: ${themeVars.accent}
--landing-text: ${themeVars.text}

Current HTML:\n\`\`\`html\n${currentHtml}\n\`\`\`\n\nInstruction: ${instruction}`,
  });

  let html = result.text.trim();
  // Strip markdown fences
  if (html.startsWith("```")) {
    html = html.replace(/^```(?:html)?\s*/, "").replace(/\s*```$/, "");
  }

  if (!html.startsWith("<")) {
    return Response.json(
      { error: "AI returned invalid HTML", raw: html },
      { status: 502 }
    );
  }

  // Update section.html in DB
  const updatedSections = sections.map((s) =>
    s.id === sectionId ? { ...s, html } : s
  );

  await db.landing.update({
    where: { id: landingId },
    data: { sections: updatedSections as any },
  });

  return Response.json({ html });
}
