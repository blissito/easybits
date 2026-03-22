import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { streamText } from "ai";
import { resolveModelLocal } from "../aiModels";
import { INSPIRE_EXTRACT_PROMPT } from "~/lib/presentationPrompts";

const STYLE_MODEL = "gemini-2.5-flash";

function throwJson(error: string, status: number): never {
  throw new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function listPresentationStyles(ctx: AuthContext) {
  requireScope(ctx, "READ");
  return db.presentationStyle.findMany({
    where: { ownerId: ctx.user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, designSystem: true, createdAt: true },
  });
}

export async function deletePresentationStyle(ctx: AuthContext, id: string) {
  requireScope(ctx, "DELETE");
  const style = await db.presentationStyle.findUnique({ where: { id } });
  if (!style || style.ownerId !== ctx.user.id) throwJson("Style not found", 404);
  await db.presentationStyle.delete({ where: { id } });
  return { success: true };
}

export async function savePresentationStyle(
  ctx: AuthContext,
  opts: { name: string; pageImages: string[]; sourceFileId?: string }
): Promise<{ id: string; name: string; designSystem: any }> {
  requireScope(ctx, "WRITE");

  const images = opts.pageImages;
  const sampleIndices = selectRepresentativePages(images.length);
  const sampleImages = sampleIndices.map((i) => images[i]);

  const designSystem = await extractDesignSystem(sampleImages);

  const style = await db.presentationStyle.create({
    data: {
      name: opts.name,
      designSystem: designSystem as any,
      sampleImages: sampleImages.slice(0, 3) as any,
      sourceFileId: opts.sourceFileId,
      ownerId: ctx.user.id,
    },
  });

  return { id: style.id, name: style.name, designSystem };
}

function selectRepresentativePages(total: number): number[] {
  if (total <= 4) return Array.from({ length: total }, (_, i) => i);
  return [0, Math.floor(total / 3), Math.floor((2 * total) / 3), total - 1];
}

async function extractDesignSystem(pageImages: string[]): Promise<any> {
  const model = resolveModelLocal(STYLE_MODEL);

  const content: any[] = pageImages.map((img) => ({
    type: "image" as const,
    image: Buffer.from(img, "base64"),
  }));
  content.push({ type: "text" as const, text: "Analyze these presentation slides and extract the design system." });

  const result = streamText({
    model,
    system: INSPIRE_EXTRACT_PROMPT,
    messages: [{ role: "user", content }],
  });

  const text = await result.text;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse design system from AI response");
  }
}
