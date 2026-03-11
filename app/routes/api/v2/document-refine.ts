import type { Route } from "./+types/document-refine";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { Section3 } from "~/lib/landing3/types";
import { checkAiGenerationLimit, incrementAiGeneration } from "~/.server/aiGenerationLimit";
import { enrichImages, findImageSlots } from "@easybits.cloud/html-tailwind-generator/images";
import { generateSvg } from "@easybits.cloud/html-tailwind-generator/images";

const VARIANT_SYSTEM_PROMPT = `You are an elite document designer. You create stunning visual variants of document pages for letter-sized (8.5" × 11") format.

TASK: Given an existing page, create a COMPLETELY DIFFERENT visual design while keeping the SAME text content and the SAME color theme.

RULES:
- Output ONLY the HTML <section>...</section> — no markdown, no explanation
- Keep ALL the same text/data content — change ONLY the visual presentation
- Redesign layout structure, typography scale, decorative elements, spacing, alignment — but KEEP the same color theme
- Use bold, confident design choices — large type contrasts, asymmetric layouts, dramatic whitespace
- Keep content within page boundaries (7" × 9.5" effective area with 0.75" margins)
- Decorative elements with absolute positioning MUST stay fully inside the page — no negative coordinates, no elements beyond the right edge
- Large decorative text (text-[200px] etc.) MUST have opacity-5 AND overflow-hidden on container
- For charts/data viz, use pure CSS bars/progress — NEVER Chart.js or canvas
- For complex charts: <div data-svg-chart="description with data" class="w-full"></div>
- For images: <img data-image-query="english search query" alt="description" class="w-full h-auto object-cover rounded-xl"/>
- NEVER use emojis — use SVG icons or geometric shapes instead
- Ensure strong contrast: dark text on light, light text on dark

COLOR SYSTEM — use ONLY semantic Tailwind classes (NEVER hardcode hex/rgb colors):
- bg-primary, text-primary, bg-primary-light, bg-primary-dark, text-on-primary
- bg-surface, bg-surface-alt, text-on-surface, text-on-surface-muted
- bg-secondary, text-secondary, bg-accent, text-accent
- CONTRAST: bg-primary/bg-primary-dark → text-on-primary or text-white
- CONTRAST: bg-surface/bg-surface-alt → text-on-surface
- You may use Tailwind gray/white/black for subtle accents, but primary colors MUST come from semantic classes
- Study the OTHER PAGES provided to match their visual language (color usage, backgrounds, decorative patterns)

DESIGN VARIETY — choose a DIFFERENT approach from the original:
- If original uses centered layout → try asymmetric or grid
- If original uses small text → try oversized headlines with small body
- If original uses rounded shapes → try sharp geometric or diagonal cuts
- If original is minimal → try rich with decorative elements (or vice versa)

ADAPT TO DOCUMENT TYPE — Not everything is a report. Match the visual style to the content:
- Brochures/Marketing: bold images, large headlines, feature grids, visual storytelling
- Catalogs: product cards, specs grids, price highlights
- Invitations: centered dramatic typography, decorative borders, elegant spacing
- Reports: tables, progress bars, metric cards, data hierarchy
- Study the existing content to determine the type and design accordingly`;

const REFINE_SYSTEM_PROMPT = `You are a professional document designer. You refine HTML content for letter-sized (8.5" × 11") document pages.

CRITICAL PRIORITY RULES — SURGICAL EDITS:
- Make the SMALLEST possible change to fulfill the instruction
- If the instruction mentions a specific element (circles, dots, header, logo, icon, chart, etc.), find that exact element and modify ONLY it
- Do NOT change layout, colors, typography, structure, or content that the instruction does not mention
- The output HTML must be 90%+ identical to the input — only the targeted element should differ
- NEVER rewrite the entire page for a small change request
- Keep all existing classes, inline styles, and structure intact unless the instruction explicitly asks to change them

GENERAL RULES:
- Output ONLY the refined HTML <section>...</section> — no markdown, no explanation
- Keep content within page boundaries (7" × 9.5" effective area with 0.75" margins)
- Use Tailwind CSS classes for styling
- Maintain professional, colorful design with geometric elements, gradients, SVG icons
- For charts and data visualization, use pure CSS bars/progress elements — NEVER use Chart.js or canvas

COLOR SYSTEM — use ONLY semantic Tailwind classes (NEVER hardcode hex/rgb colors):
- bg-primary, text-primary, bg-primary-light, bg-primary-dark, text-on-primary
- bg-surface, bg-surface-alt, text-on-surface, text-on-surface-muted
- bg-secondary, text-secondary, bg-accent, text-accent
- CONTRAST: bg-primary/bg-primary-dark → text-on-primary or text-white
- CONTRAST: bg-surface/bg-surface-alt → text-on-surface
- You may use Tailwind gray/white/black for subtle accents, but primary colors MUST come from semantic classes
- For complex charts/diagrams, use: <div data-svg-chart="description with data" class="w-full"></div> — the system generates SVGs automatically
- For images, use: <img data-image-query="english search query" alt="description" class="w-full h-auto object-cover rounded-xl"/> — the system resolves real images
- NEVER use emojis anywhere — use SVG icons or geometric shapes instead
- Ensure strong contrast: dark text on light backgrounds, light text on dark backgrounds`;

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
  const section = isNewSection
    ? null
    : sections.find((s) => s.id === sectionId);
  // Fallback: client sends currentHtml, use it if section not in DB yet (race condition with saveSections)
  if (!isNewSection && !section && !currentHtml) {
    return Response.json({ error: "Section not found" }, { status: 404 });
  }

  // Check AI generation limit
  const genLimit = await checkAiGenerationLimit(ctx.user.id);
  if (!genLimit.allowed) {
    return Response.json(
      { error: `Has usado todas tus ${genLimit.limit} generaciones de este mes.` },
      { status: 429 }
    );
  }
  let quotaIncremented = false;

  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const anthropic = createAnthropic({ apiKey: userKey || undefined });

  const isVariantMode = instruction === "VARIANT_MODE";
  const systemPrompt = isVariantMode ? VARIANT_SYSTEM_PROMPT : REFINE_SYSTEM_PROMPT;

  // Build neighbor pages context for style consistency
  const allSections = (body.allSections || []) as { id: string; label?: string; html: string }[];
  let neighborContext = "";
  if (allSections.length > 1) {
    const idx = allSections.findIndex((s) => s.id === sectionId);
    const neighbors: string[] = [];
    if (idx > 0) {
      const prev = allSections[idx - 1];
      neighbors.push(`[Page ${idx} - ${prev.label || "Previous"}]: ${prev.html}`);
    }
    if (idx >= 0 && idx < allSections.length - 1) {
      const next = allSections[idx + 1];
      neighbors.push(`[Page ${idx + 2} - ${next.label || "Next"}]: ${next.html}`);
    }
    if (neighbors.length > 0) {
      neighborContext = `\n\nHere are other pages in the same document for style reference:\n${neighbors.join("\n\n")}`;
    }
  }

  const pageHtml = currentHtml || section?.html || "<section></section>";
  const multiPageHint = isNewSection
    ? `\n\nYou may output MULTIPLE <section> tags if the user requests multiple pages. Each <section> becomes a separate page.
CRITICAL: Each section MUST use this exact structure: <section class="w-[8.5in] h-[11in] relative overflow-hidden ...">
The section MUST be exactly 8.5in wide and 11in tall (letter size). Content must fit within the page. Use overflow-hidden.
Do NOT use w-full, min-h-screen, or responsive classes — this is a fixed-size print document.
ALWAYS output one <section> per page. NEVER put multiple pages of content inside a single <section>.
Each <section> = exactly one letter-sized page. If content needs 3 pages, output 3 separate <section> tags.`
    : "";
  const outputHint = isNewSection
    ? "Output the <section> HTML (multiple <section> tags for multiple pages)."
    : "Output ONLY the refined <section> HTML.";
  const messages: any[] = [];
  if (referenceImage) {
    // Convert data URL to Uint8Array for AI SDK
    const base64Match = referenceImage.match(/^data:([^;]+);base64,(.+)$/);
    const imageContent = base64Match
      ? { type: "image" as const, image: new Uint8Array(Buffer.from(base64Match[2], "base64")), mimeType: base64Match[1] }
      : { type: "image" as const, image: referenceImage };
    messages.push({
      role: "user",
      content: [
        imageContent,
        {
          type: "text",
          text: `Current HTML:\n${pageHtml}\n\nInstruction: ${instruction}${neighborContext}${multiPageHint}\n\nUse the image as design reference. ${outputHint}`,
        },
      ],
    });
  } else if (isVariantMode) {
    messages.push({
      role: "user",
      content: `Here is the current page HTML. Create a completely different visual variant:\n\n${pageHtml}${neighborContext}\n\nOutput ONLY the new <section> HTML.`,
    });
  } else {
    messages.push({
      role: "user",
      content: `Current HTML:\n${pageHtml}\n\nInstruction: ${instruction}${neighborContext}${multiPageHint}\n\n${outputHint}`,
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: any) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const model = "claude-haiku-4-5-20251001";

        const result = streamText({
          model: anthropic(model),
          system: systemPrompt,
          messages,
          maxTokens: isVariantMode ? 8000 : isNewSection ? 12000 : 4000,
        });

        let fullHtml = "";
        let chunkCount = 0;

        for await (const chunk of result.textStream) {
          fullHtml += chunk;
          chunkCount++;
          if (!quotaIncremented) {
            quotaIncremented = true;
            incrementAiGeneration(ctx.user.id);
          }

          // Send partial HTML every ~5 chunks for real-time feel
          if (chunkCount % 5 === 0) {
            const sectionMatch = fullHtml.match(
              /<section[\s\S]*<\/section>/i
            );
            if (sectionMatch) {
              send("chunk", { html: sectionMatch[0] });
            } else {
              // Send partial: close the section tag so iframe can render
              const openMatch = fullHtml.match(/<section[\s\S]*/i);
              if (openMatch) {
                send("chunk", { html: openMatch[0] + "</section>" });
              }
            }
          }
        }

        // Final extraction — support multiple sections for __new__ mode
        const allSectionMatches = fullHtml.match(/<section[\s\S]*?<\/section>/gi) || [];
        let finalHtml: string;
        let multipleSections: string[] | null = null;

        if (isNewSection && allSectionMatches.length > 1) {
          // Multiple pages generated — enrich each independently
          multipleSections = allSectionMatches;
          finalHtml = allSectionMatches.join("\n");
        } else {
          const finalMatch = fullHtml.match(/<section[\s\S]*<\/section>/i);
          finalHtml = finalMatch ? finalMatch[0] : fullHtml;
        }

        // Enrich images (Pexels → DALL-E → placeholder)
        const imageSlots = findImageSlots(finalHtml);
        if (imageSlots.length > 0) {
          const openaiKey = await resolveAiKey(ctx.user.id, "OPENAI");
          finalHtml = await enrichImages(finalHtml, {
            pexelsApiKey: process.env.PEXELS_API_KEY,
            openaiApiKey: openaiKey || undefined,
          });
          send("chunk", { html: finalHtml });
        }

        // Enrich SVG charts
        const svgRegex = /<div\s[^>]*data-svg-chart="([^"]+)"[^>]*>[\s\S]*?<\/div>/gi;
        const svgMatches: { fullMatch: string; prompt: string }[] = [];
        let svgM: RegExpExecArray | null;
        while ((svgM = svgRegex.exec(finalHtml)) !== null) {
          svgMatches.push({ fullMatch: svgM[0], prompt: svgM[1] });
        }
        if (svgMatches.length > 0) {
          const results = await Promise.allSettled(
            svgMatches.map(async ({ fullMatch, prompt }) => {
              try {
                const svg = await generateSvg(prompt, userKey || undefined);
                return { fullMatch, svg };
              } catch (e) {
                console.warn(`[svg-refine] failed for "${prompt}":`, e);
                return { fullMatch, svg: `<div class="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-sm">${prompt}</div>` };
              }
            })
          );
          for (const r of results) {
            if (r.status === "fulfilled" && r.value) {
              finalHtml = finalHtml.replace(r.value.fullMatch, r.value.svg);
            }
          }
          send("chunk", { html: finalHtml });
        }

        // DB update is handled by the client via saveSections() — no server-side write
        // This avoids race conditions that strip version history from sections

        if (multipleSections && multipleSections.length > 1) {
          // Re-extract after enrichment
          const enrichedSections = finalHtml.match(/<section[\s\S]*?<\/section>/gi) || [finalHtml];
          send("done", { html: enrichedSections[0], sections: enrichedSections });
        } else {
          send("done", { html: finalHtml });
        }
        controller.close();
      } catch (err: any) {
        send("error", { message: err.message || "Refine failed" });
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
