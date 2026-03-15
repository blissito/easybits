import type { Route } from "./+types/book-generate";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import { streamText } from "ai";
import { checkAiGenerationLimit, incrementAiGeneration } from "~/.server/aiGenerationLimit";
import { getAiModel, resolveModelLocal } from "~/.server/aiModels";
import { nanoid } from "nanoid";
import type { Section3 } from "@easybits.cloud/html-tailwind-generator";

const BOOK_PAGE_SYSTEM = `You are a professional book typesetter and translator. You format text into beautiful HTML pages sized for 6"×9" trade paperback (5.5in × 8.5in content area with margins).

Rules:
- Output NDJSON: one JSON object per line, each representing a page
- Each object: { "order": number, "label": string, "html": string }
- order starts at 0
- label is "Página 1", "Página 2", etc. (1-indexed)
- html is a single <section> element with the page content
- Use semantic Tailwind color tokens: bg-primary, bg-surface, text-on-surface, text-on-primary, border-primary, bg-accent, text-on-accent
- Typography: use serif fonts (font-serif), generous line-height (leading-relaxed or leading-loose), proper paragraph spacing (mb-4 or mb-6)
- Each <section> must have: class="w-full min-h-[8.5in] p-[0.75in] font-serif leading-relaxed text-on-surface bg-surface"
- Break text naturally at paragraph boundaries — each page should have roughly 250-350 words
- Preserve the original text structure (paragraphs, dialogue, headings)
- If translating, produce natural, literary-quality translation
- Do NOT add any text before or after the NDJSON lines
- Do NOT wrap in markdown code blocks`;

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json();
  const { chapterId, bookId, sourceText, targetLanguage, theme, extraInstructions } = body;

  if (!chapterId || !bookId) {
    return Response.json({ error: "chapterId and bookId required" }, { status: 400 });
  }

  if (!sourceText) {
    return Response.json({ error: "sourceText required" }, { status: 400 });
  }

  // Verify book ownership via Asset
  const book = await db.book.findUnique({
    where: { id: bookId },
    include: { asset: { select: { userId: true } } },
  });
  if (!book || book.asset.userId !== ctx.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Verify chapter belongs to book
  const chapter = await db.bookChapter.findUnique({ where: { id: chapterId } });
  if (!chapter || chapter.bookId !== bookId) {
    return Response.json({ error: "Chapter not found" }, { status: 404 });
  }

  // Check AI generation limit
  const genLimit = await checkAiGenerationLimit(ctx.user.id);
  if (!genLimit.allowed) {
    return Response.json(
      { error: `Has usado todas tus ${genLimit.limit} generaciones de este mes.`, upgradeUrl: "/dash/packs" },
      { status: 429 }
    );
  }

  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const openaiKey = await resolveAiKey(ctx.user.id, "OPENAI") || process.env.OPENAI_API_KEY;

  const modelId = await getAiModel("docGenerate");
  const model = resolveModelLocal(modelId, openaiKey || undefined, userKey || undefined);

  let quotaIncremented = false;
  const startTime = Date.now();
  const allSections: Section3[] = [];

  const translateInstruction = targetLanguage
    ? `Translate the following text to ${targetLanguage} while formatting it into book pages.`
    : "Format the following text into book pages.";

  const userPrompt = [
    translateInstruction,
    extraInstructions ? `Additional instructions: ${extraInstructions}` : "",
    theme && theme !== "default" ? `Theme: ${theme}` : "",
    `\n---\n\n${sourceText}`,
  ].filter(Boolean).join("\n");

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: any) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const result = streamText({
          model,
          system: BOOK_PAGE_SYSTEM,
          prompt: userPrompt,
          maxOutputTokens: 16000,
        });

        // Parse NDJSON using brace-depth tracking
        let buffer = "";
        let braceDepth = 0;
        let inString = false;
        let escaped = false;
        let objectStart = -1;
        let pageIndex = 0;

        // Send initial outline estimate based on text length
        const estimatedPages = Math.max(1, Math.ceil(sourceText.length / 1500));
        const outlinePages = Array.from({ length: estimatedPages }, (_, i) => ({
          pageNumber: i + 1,
          label: `Página ${i + 1}`,
        }));
        send("outline", { pages: outlinePages, estimated: true });

        let inputTokens = 0;
        let outputTokens = 0;

        for await (const chunk of result.textStream) {
          buffer += chunk;

          // Send partial HTML for current page being built
          if (braceDepth > 0 && objectStart >= 0) {
            send("section-building", { html: buffer.slice(objectStart), order: pageIndex });
          }

          // Scan for complete JSON objects
          for (let i = 0; i < buffer.length; i++) {
            const ch = buffer[i];

            if (escaped) {
              escaped = false;
              continue;
            }
            if (ch === "\\" && inString) {
              escaped = true;
              continue;
            }
            if (ch === '"') {
              inString = !inString;
              continue;
            }
            if (inString) continue;

            if (ch === "{") {
              if (braceDepth === 0) objectStart = i;
              braceDepth++;
            } else if (ch === "}") {
              braceDepth--;
              if (braceDepth === 0 && objectStart >= 0) {
                const jsonStr = buffer.slice(objectStart, i + 1);
                try {
                  const parsed = JSON.parse(jsonStr);
                  const section: Section3 = {
                    id: nanoid(),
                    order: pageIndex,
                    html: parsed.html || "",
                    label: parsed.label || `Página ${pageIndex + 1}`,
                  };
                  allSections.push(section);
                  send("section", section);
                  pageIndex++;
                } catch {
                  // malformed JSON, skip
                }
                objectStart = -1;
                buffer = buffer.slice(i + 1);
                i = -1; // restart scan on remaining buffer
              }
            }
          }
        }

        // Collect usage
        try {
          const usage = await result.usage;
          inputTokens = (usage as any)?.promptTokens || (usage as any)?.inputTokens || 0;
          outputTokens = (usage as any)?.completionTokens || (usage as any)?.outputTokens || 0;
        } catch {
          // usage may not be available
        }

        // Increment generation quota
        if (!quotaIncremented) {
          quotaIncremented = true;
          await incrementAiGeneration(ctx.user.id, undefined, {
            type: "generate",
            product: "document",
            modelId,
            inputTokens,
            outputTokens,
            resourceId: chapterId,
            pageCount: allSections.length,
            durationMs: Date.now() - startTime,
          });
        }

        // Save sections to chapter
        if (allSections.length > 0) {
          allSections.sort((a, b) => a.order - b.order);
          await db.bookChapter.update({
            where: { id: chapterId },
            data: {
              sections: allSections as any,
              status: "translated",
            },
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
