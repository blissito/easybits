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
import { fileEvents } from "./fileEvents";

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
      source: "mcp",
    },
  });

  const savings = originalSize > 0
    ? Math.round((1 - optimizedSize / originalSize) * 100)
    : 0;

  fileEvents.emit("file:changed", ctx.user.id);

  return {
    file: newFile,
    originalSize,
    optimizedSize,
    savings: `${savings}%`,
  };
}

export async function transformImage(
  ctx: AuthContext,
  params: {
    fileId: string;
    width?: number;
    height?: number;
    fit?: "cover" | "contain" | "fill" | "inside" | "outside";
    format?: "webp" | "avif" | "png" | "jpeg";
    quality?: number;
    rotate?: number;
    flip?: boolean;
    grayscale?: boolean;
  }
) {
  requireScope(ctx, "WRITE");

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

  // Build sharp pipeline
  let pipeline = sharp(sourceBuffer);
  const transforms: string[] = [];

  if (params.width || params.height) {
    pipeline = pipeline.resize({
      width: params.width,
      height: params.height,
      fit: params.fit ?? "inside",
    });
    transforms.push(`resize:${params.width ?? "auto"}x${params.height ?? "auto"}`);
  }

  if (params.rotate !== undefined) {
    pipeline = pipeline.rotate(params.rotate);
    transforms.push(`rotate:${params.rotate}`);
  }

  if (params.flip) {
    pipeline = pipeline.flip();
    transforms.push("flip");
  }

  if (params.grayscale) {
    pipeline = pipeline.grayscale();
    transforms.push("grayscale");
  }

  // Determine output format
  const format = params.format;
  const contentTypeMap = {
    webp: "image/webp",
    avif: "image/avif",
    png: "image/png",
    jpeg: "image/jpeg",
  } as const;

  if (format) {
    const quality = params.quality;
    if (format === "webp") pipeline = pipeline.webp({ quality });
    else if (format === "avif") pipeline = pipeline.avif({ quality });
    else if (format === "png") pipeline = pipeline.png();
    else if (format === "jpeg") pipeline = pipeline.jpeg({ quality });
    transforms.push(`format:${format}`);
  } else if (params.quality) {
    // Apply quality to original format if possible
    if (file.contentType === "image/webp") pipeline = pipeline.webp({ quality: params.quality });
    else if (file.contentType === "image/jpeg") pipeline = pipeline.jpeg({ quality: params.quality });
    else if (file.contentType === "image/avif") pipeline = pipeline.avif({ quality: params.quality });
  }

  const transformedBuffer = await pipeline.toBuffer();
  const transformedSize = transformedBuffer.length;

  // Resolve storage
  const provider = await resolveProvider(ctx.user.id);
  const storageKey = file.assetIds?.length
    ? `${ctx.user.id}/${file.assetIds[0]}/${nanoid(3)}`
    : `${ctx.user.id}/${nanoid(3)}`;
  const client = provider ? createStorageClient(provider) : getPlatformDefaultClient();

  const newContentType = format ? contentTypeMap[format] : file.contentType;
  const putUrl = await client.getPutUrl(storageKey);
  const putResponse = await fetch(putUrl, {
    method: "PUT",
    body: transformedBuffer,
    headers: { "Content-Type": newContentType },
  });
  if (!putResponse.ok) {
    throw new Error("Failed to upload transformed image");
  }

  // Build new filename
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const ext = format ?? file.name.split(".").pop() ?? "img";
  const newName = `${baseName}_transformed.${ext}`;

  const newFile = await db.file.create({
    data: {
      name: newName,
      storageKey,
      slug: storageKey,
      size: transformedSize,
      contentType: newContentType,
      ownerId: ctx.user.id,
      access: file.access,
      url: "",
      status: "DONE",
      storageProviderId: provider?.id ?? null,
      source: "mcp",
      ...(file.assetIds?.length ? { assetIds: file.assetIds } : {}),
    },
  });

  fileEvents.emit("file:changed", ctx.user.id);

  return {
    file: newFile,
    originalSize,
    transformedSize,
    transforms,
  };
}
