import type { Route } from "./+types/landing3-generate";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import { generateLanding } from "@easybits.cloud/html-tailwind-generator/generate";
import type { Section3 } from "@easybits.cloud/html-tailwind-generator";

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
          prompt,
          referenceImage,
          extraInstructions,
          pexelsApiKey: process.env.PEXELS_API_KEY,
          onSection(section) {
            allSections.push(section);
            send("section", section);
          },
          onImageUpdate(sectionId, html) {
            // Update the section in our tracking array too
            const s = allSections.find((s) => s.id === sectionId);
            if (s) s.html = html;
            send("section-update", { id: sectionId, html });
          },
          async onDone() {
            // Save to DB
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
