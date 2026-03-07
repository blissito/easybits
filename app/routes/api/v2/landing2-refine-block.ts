import type { Route } from "./+types/landing2-refine-block";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { SECTION_REFINE_PROMPT } from "~/lib/landingPrompts";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import type { LandingBlock } from "~/lib/landing2/blockTypes";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json();
  const { landingId, blockId, instruction } = body;

  if (!landingId || !blockId || !instruction) {
    return Response.json(
      { error: "landingId, blockId, and instruction required" },
      { status: 400 }
    );
  }

  const landing = await db.landing.findUnique({ where: { id: landingId } });
  if (!landing || landing.ownerId !== ctx.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const blocks = (landing.sections || []) as unknown as LandingBlock[];
  const block = blocks.find((b) => b.id === blockId);
  if (!block) {
    return Response.json({ error: "Block not found" }, { status: 404 });
  }

  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const anthropic = userKey
    ? createAnthropic({ apiKey: userKey })
    : createAnthropic();

  const model = anthropic("claude-sonnet-4-6");

  const result = await generateText({
    model,
    system: `You refine landing page block content. Given a block's current content (JSON) and an instruction, return the updated content as a JSON object. Return ONLY valid JSON, no markdown fences.`,
    prompt: `Block type: ${block.type}
Current content: ${JSON.stringify(block.content)}

Instruction: ${instruction}

Return the updated content as a JSON object.`,
  });

  let raw = result.text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  let content: any;
  try {
    content = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: "Failed to parse AI response", raw },
      { status: 502 }
    );
  }

  const updatedBlocks = blocks.map((b) =>
    b.id === blockId ? { ...b, content } : b
  );

  await db.landing.update({
    where: { id: landingId },
    data: { sections: updatedBlocks as any },
  });

  return Response.json({ content });
}
