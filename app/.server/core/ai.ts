import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { db } from "../db";
import { resolveAiKey } from "./aiKeyOperations";

async function getAnthropicProvider(userId?: string) {
  if (userId) {
    const userKey = await resolveAiKey(userId, "ANTHROPIC");
    if (userKey) return createAnthropic({ apiKey: userKey });
  }
  return createAnthropic();
}

export async function autoTagFile(fileId: string) {
  const file = await db.file.findUnique({ where: { id: fileId } });
  if (!file) return;

  const provider = await getAnthropicProvider(file.ownerId);

  const { object } = await generateObject({
    model: provider("claude-haiku-4-5-20251001"),
    schema: z.object({
      tags: z.array(z.string()).max(10).describe("Relevant tags for this file"),
      category: z.string().describe("Primary category"),
    }),
    prompt: `Analyze this file and suggest tags and a category.
File name: ${file.name}
Content type: ${file.contentType}
Size: ${file.size} bytes`,
  });

  await db.file.update({
    where: { id: fileId },
    data: {
      metadata: {
        ...(file.metadata as Record<string, unknown> || {}),
        tags: object.tags,
        category: object.category,
      },
    },
  });

  return object;
}

export async function searchFilesWithAI(
  userId: string,
  query: string
) {
  const provider = await getAnthropicProvider(userId);

  const { object } = await generateObject({
    model: provider("claude-haiku-4-5-20251001"),
    schema: z.object({
      nameContains: z.string().optional().describe("Substring to match in file name"),
      contentTypes: z.array(z.string()).optional().describe("MIME types to filter"),
      status: z.enum(["PENDING", "WORKING", "DONE", "ERROR", "DELETED"]).optional(),
    }),
    prompt: `Convert this natural language search into file filters.
Query: "${query}"
Available statuses: PENDING, WORKING, DONE, ERROR, DELETED
Common content types: image/png, image/jpeg, video/mp4, application/pdf, application/zip`,
  });

  const where: Record<string, unknown> = { ownerId: userId };
  if (object.nameContains) {
    where.name = { contains: object.nameContains, mode: "insensitive" };
  }
  if (object.contentTypes?.length) {
    where.contentType = { in: object.contentTypes };
  }
  if (object.status) {
    where.status = object.status;
  } else {
    where.status = { not: "DELETED" };
  }

  return db.file.findMany({
    where,
    take: 20,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      size: true,
      contentType: true,
      status: true,
      metadata: true,
      createdAt: true,
    },
  });
}
