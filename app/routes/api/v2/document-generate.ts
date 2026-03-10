import type { Route } from "./+types/document-generate";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import { generateLanding } from "@easybits.cloud/html-tailwind-generator/generate";
import type { Section3 } from "@easybits.cloud/html-tailwind-generator";

const DOCUMENT_SYSTEM_PROMPT = `You are a professional document designer. You create beautiful letter-sized (8.5" × 11") document pages using HTML + Tailwind CSS.

RULES:
- Each page is a <section> element that fits within 8.5" × 11" with 0.75" margins (effective area: 7" × 9.5")
- Content MUST NOT overflow the page boundaries — be conservative with spacing
- Use professional, colorful designs: geometric decorations, gradients, SVG icons inline, accent colors
- Typography: use font weights (font-light to font-black), good hierarchy (headings, subheadings, body)
- For numerical data, create beautiful styled tables or visual representations with colored bars/progress elements
- Tables: use Tailwind table classes, alternating row colors, clean borders
- Include decorative elements: colored sidebars, header bands, icon accents
- First page should be a cover/title page with impactful design
- Use page-appropriate content density — don't cram too much on one page
- Use Tailwind CDN classes ONLY (no custom CSS)
- NO JavaScript, only HTML+Tailwind
- All text content in Spanish unless the prompt specifies otherwise
- Use real content from the source material, not Lorem ipsum

IMAGES:
- EVERY image MUST use: <img data-image-query="english search query" alt="description" class="w-full h-auto object-cover rounded-xl"/>
- NEVER include a src attribute — the system auto-replaces data-image-query with a real image URL

OUTPUT FORMAT: NDJSON — one JSON object per line, NO wrapper array, NO markdown fences.
Each line: {"label": "Page Title", "html": "<section>...</section>"}`;

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json();
  const { landingId, prompt, sourceContent, logoDataUrl, extraInstructions } = body;

  if (!landingId) {
    return Response.json({ error: "landingId required" }, { status: 400 });
  }

  const landing = await db.landing.findUnique({ where: { id: landingId } });
  if (!landing || landing.ownerId !== ctx.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");

  // Build the prompt combining source content + user instructions
  const parts = [
    sourceContent
      ? `Transform this content into beautiful document pages:\n\n${sourceContent.substring(0, 30000)}`
      : "Create a professional document",
    prompt ? `\nInstructions: ${prompt}` : "",
    "\nGenerate 3-8 pages depending on content length.",
  ].filter(Boolean).join("\n");

  // Build extra instructions including logo info
  const extras = [
    extraInstructions || "",
    logoDataUrl ? "A company logo has been provided as reference image. Include it conceptually in the cover page design." : "",
  ].filter(Boolean).join("\n");

  const allSections: Section3[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: any) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        await generateLanding({
          anthropicApiKey: userKey || undefined,
          prompt: parts,
          referenceImage: logoDataUrl || undefined,
          extraInstructions: extras || undefined,
          systemPrompt: DOCUMENT_SYSTEM_PROMPT,
          pexelsApiKey: process.env.PEXELS_API_KEY,
          onSection(section) {
            allSections.push(section);
            send("section", section);
          },
          onImageUpdate(sectionId, html) {
            const s = allSections.find((s) => s.id === sectionId);
            if (s) s.html = html;
            send("section-update", { id: sectionId, html });
          },
          async onDone() {
            if (allSections.length > 0) {
              await db.landing.update({
                where: { id: landingId },
                data: { sections: allSections as any },
              });
            }
            send("done", { total: allSections.length });
            controller.close();
          },
          onError(err) {
            send("error", { message: err.message || "Generation failed" });
            controller.close();
          },
        });
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
