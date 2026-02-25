import sharp from "sharp";
import { nanoid } from "nanoid";
import { db } from "../db";
import {
  getClientForFile,
  resolveProvider,
  createStorageClient,
  getPlatformDefaultClient,
} from "../storage";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";

export async function optimizeImage(
  ctx: AuthContext,
  params: {
    fileId: string;
    format?: "webp" | "avif";
    quality?: number;
  }
) {
  requireScope(ctx, "WRITE");

  const format = params.format ?? "webp";
  const quality = params.quality ?? (format === "avif" ? 50 : 80);

  // Fetch source file
  const file = await db.file.findUnique({ where: { id: params.fileId } });
  if (!file || file.status === "DELETED") {
    throw new Error("File not found");
  }
  if (file.ownerId !== ctx.user.id) {
    throw new Error("Forbidden");
  }
  if (!file.contentType.startsWith("image/")) {
    throw new Error("File is not an image");
  }

  // Download original
  const sourceClient = await getClientForFile(file.storageProviderId, ctx.user.id);
  const readUrl = await sourceClient.getReadUrl(file.storageKey);
  const response = await fetch(readUrl);
  if (!response.ok) {
    throw new Error("Failed to download source image");
  }
  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  const originalSize = sourceBuffer.length;

  // Convert with sharp
  const pipeline = sharp(sourceBuffer);
  const optimizedBuffer =
    format === "avif"
      ? await pipeline.avif({ quality }).toBuffer()
      : await pipeline.webp({ quality }).toBuffer();
  const optimizedSize = optimizedBuffer.length;

  // Resolve storage for new file
  const provider = await resolveProvider(ctx.user.id);
  const storageKey = file.assetIds?.length
    ? `${ctx.user.id}/${file.assetIds[0]}/${nanoid(3)}`
    : `${ctx.user.id}/${nanoid(3)}`;
  const client = provider ? createStorageClient(provider) : getPlatformDefaultClient();

  // Upload optimized file
  const putUrl = await client.getPutUrl(storageKey);
  const contentType = format === "avif" ? "image/avif" : "image/webp";
  const putResponse = await fetch(putUrl, {
    method: "PUT",
    body: optimizedBuffer,
    headers: { "Content-Type": contentType },
  });
  if (!putResponse.ok) {
    throw new Error("Failed to upload optimized image");
  }

  // Build new filename
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const newName = `${baseName}.${format}`;

  // Create file record
  const newFile = await db.file.create({
    data: {
      name: newName,
      storageKey,
      slug: storageKey,
      size: optimizedSize,
      contentType,
      ownerId: ctx.user.id,
      access: file.access,
      url: "",
      status: "DONE",
      storageProviderId: provider?.id ?? null,
      ...(file.assetIds?.length ? { assetIds: file.assetIds } : {}),
    },
  });

  const savings = originalSize > 0
    ? Math.round((1 - optimizedSize / originalSize) * 100)
    : 0;

  return {
    file: newFile,
    originalSize,
    optimizedSize,
    savings: `${savings}%`,
  };
}
