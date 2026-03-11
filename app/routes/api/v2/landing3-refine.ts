import type { Route } from "./+types/landing3-refine";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import { refineLanding } from "@easybits.cloud/html-tailwind-generator/refine";
import type { Section3 } from "@easybits.cloud/html-tailwind-generator";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json();
  const { landingId, sectionId, instruction, currentHtml, referenceImage, isVariant } =
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

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: any) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        await refineLanding({
          anthropicApiKey: userKey || undefined,
          currentHtml: currentHtml || section?.html || "<section></section>",
          instruction,
          referenceImage,
          isVariant: !!isVariant,
          pexelsApiKey: process.env.PEXELS_API_KEY,
          onChunk(html) {
            send("chunk", { html });
          },
          async onDone(html) {
            // Update section in DB (skip for new sections — editor handles that)
            if (!isNewSection) {
              for (let attempt = 0; attempt < 3; attempt++) {
                try {
                  // Re-read sections to avoid stale data overwrites
                  const fresh = await db.landing.findUnique({ where: { id: landingId } });
                  const freshSections = (fresh?.sections || []) as unknown as Section3[];
                  const updatedSections = freshSections.map((s) =>
                    s.id === sectionId ? { ...s, html } : s
                  );
                  await db.landing.update({
                    where: { id: landingId },
                    data: { sections: updatedSections as any },
                  });
                  break;
                } catch (err: any) {
                  if (err?.code === "P2034" && attempt < 2) continue;
                  throw err;
                }
              }
            }

            send("done", { html });
            controller.close();
          },
          onError(err) {
            send("error", { message: err.message || "Refine failed" });
            controller.close();
          },
        });
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
