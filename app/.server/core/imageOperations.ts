import sharp from "sharp";
import { nanoid } from "nanoid";
import { db } from "../db";
import {
  getClientForFile,
  getReadClientForPlatformFile,
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
  const sourceClient = file.storageProviderId
    ? await getClientForFile(file.storageProviderId, ctx.user.id)
    : getReadClientForPlatformFile(file);
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
    body: new Uint8Array(optimizedBuffer),
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
    cropLeft?: number;
    cropTop?: number;
    cropWidth?: number;
    cropHeight?: number;
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
  const sourceClient = file.storageProviderId
    ? await getClientForFile(file.storageProviderId, ctx.user.id)
    : getReadClientForPlatformFile(file);
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

  if (params.cropWidth && params.cropHeight) {
    pipeline = pipeline.extract({
      left: params.cropLeft ?? 0,
      top: params.cropTop ?? 0,
      width: params.cropWidth,
      height: params.cropHeight,
    });
    transforms.push(`crop:${params.cropLeft ?? 0},${params.cropTop ?? 0},${params.cropWidth}x${params.cropHeight}`);
  }

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
    body: new Uint8Array(transformedBuffer),
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

export async function generateImage(
  ctx: AuthContext,
  params: {
    prompt: string;
    size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
    quality?: "low" | "medium" | "high" | "auto";
    n?: number;
    name?: string;
  }
) {
  requireScope(ctx, "WRITE");

  const apiKey = ctx.providerKeys?.openai;
  if (!apiKey) {
    throw new Error(
      "Missing OpenAI API key. Pass it to the MCP connector as `?openai_key=sk-...` in the URL or as the `X-OpenAI-Key` header."
    );
  }

  const { prompt, size = "1024x1024", quality = "auto", n = 1 } = params;

  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size, quality, n }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI gpt-image-1 error ${resp.status}: ${errText}`);
  }

  const data = (await resp.json()) as { data: Array<{ b64_json: string }> };

  const provider = await resolveProvider(ctx.user.id);
  const client = provider ? createStorageClient(provider) : getPlatformDefaultClient();
  const safeName = (params.name || prompt.slice(0, 40))
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase() || "image";

  const files = [] as any[];
  for (let i = 0; i < data.data.length; i++) {
    const buf = Buffer.from(data.data[i].b64_json, "base64");
    const storageKey = `${ctx.user.id}/${nanoid(3)}`;
    const putUrl = await client.getPutUrl(storageKey);
    const putResponse = await fetch(putUrl, {
      method: "PUT",
      body: new Uint8Array(buf),
      headers: { "Content-Type": "image/png" },
    });
    if (!putResponse.ok) {
      throw new Error("Failed to upload generated image");
    }

    const suffix = data.data.length > 1 ? `-${i + 1}` : "";
    const newFile = await db.file.create({
      data: {
        name: `${safeName}${suffix}.png`,
        storageKey,
        slug: storageKey,
        size: buf.length,
        contentType: "image/png",
        ownerId: ctx.user.id,
        access: "PRIVATE",
        url: "",
        status: "DONE",
        storageProviderId: provider?.id ?? null,
        source: "mcp",
      },
    });
    files.push({ ...newFile, b64: data.data[i].b64_json });
  }

  fileEvents.emit("file:changed", ctx.user.id);

  return {
    files,
    model: "gpt-image-1",
    prompt,
    size,
    quality,
  };
}
