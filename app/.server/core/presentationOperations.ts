import { nanoid } from "nanoid";
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { getPlatformDefaultClient } from "../storage";
import { createWebsite } from "./operations";
import { buildRevealHtml, type Slide } from "~/lib/buildRevealHtml";
import { removeHost } from "~/lib/fly_certs/certs_getters";
import { dispatchWebhooks } from "../webhooks";

function throwJson(error: string, status: number): never {
  throw new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function listPresentations(ctx: AuthContext) {
  requireScope(ctx, "READ");
  const items = await db.presentation.findMany({
    where: { ownerId: ctx.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prompt: true,
      theme: true,
      status: true,
      websiteId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return { items };
}

export async function getPresentation(ctx: AuthContext, id: string) {
  requireScope(ctx, "READ");
  const p = await db.presentation.findUnique({ where: { id } });
  if (!p || p.ownerId !== ctx.user.id) throwJson("Presentation not found", 404);
  return p;
}

export async function createPresentation(
  ctx: AuthContext,
  opts: { name: string; prompt: string; slides?: Slide[]; theme?: string }
) {
  requireScope(ctx, "WRITE");
  const name = opts.name.trim();
  if (!name) throwJson("Name required", 400);
  if (!opts.prompt.trim()) throwJson("Prompt required", 400);

  return db.presentation.create({
    data: {
      name,
      prompt: opts.prompt,
      slides: (opts.slides ?? []) as any,
      theme: opts.theme ?? "black",
      ownerId: ctx.user.id,
    },
  });
}

export async function updatePresentation(
  ctx: AuthContext,
  id: string,
  opts: { name?: string; slides?: Slide[]; theme?: string; prompt?: string }
) {
  requireScope(ctx, "WRITE");
  const p = await db.presentation.findUnique({ where: { id } });
  if (!p || p.ownerId !== ctx.user.id) throwJson("Presentation not found", 404);

  const updates: Record<string, unknown> = {};
  if (opts.name !== undefined) updates.name = opts.name;
  if (opts.slides !== undefined) updates.slides = opts.slides as any;
  if (opts.theme !== undefined) updates.theme = opts.theme;
  if (opts.prompt !== undefined) updates.prompt = opts.prompt;

  return db.presentation.update({ where: { id }, data: updates });
}

export async function deletePresentation(ctx: AuthContext, id: string) {
  requireScope(ctx, "DELETE");
  const p = await db.presentation.findUnique({ where: { id } });
  if (!p || p.ownerId !== ctx.user.id) throwJson("Presentation not found", 404);
  await db.presentation.delete({ where: { id } });
  return { success: true };
}

export async function deployPresentation(ctx: AuthContext, id: string) {
  requireScope(ctx, "WRITE");
  const p = await db.presentation.findUnique({ where: { id } });
  if (!p || p.ownerId !== ctx.user.id) throwJson("Presentation not found", 404);

  const slides = (p.slides as unknown as Slide[]) || [];
  if (slides.length === 0) throwJson("No slides to deploy", 400);

  const html = buildRevealHtml(slides, p.theme);
  const htmlBuffer = Buffer.from(html, "utf-8");

  // Create or reuse website
  let websiteId = p.websiteId;
  let slug: string;

  if (websiteId) {
    const existing = await db.website.findUnique({ where: { id: websiteId } });
    if (existing && existing.status !== "DELETED") {
      slug = existing.slug;
    } else {
      websiteId = null;
    }
  }

  if (!websiteId) {
    const website = await createWebsite(ctx, { name: p.name });
    websiteId = website.id;
    slug = website.slug;
  } else {
    slug = slug!;
  }

  // Upload index.html via presigned URL
  const client = getPlatformDefaultClient();
  const storageKey = `${ctx.user.id}/${nanoid(6)}`;
  const putUrl = await client.getPutUrl(storageKey);

  const uploadRes = await fetch(putUrl, {
    method: "PUT",
    body: htmlBuffer,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  if (!uploadRes.ok) throwJson("Failed to upload HTML to storage", 500);

  // Upsert file record
  const fileName = `sites/${websiteId}/index.html`;
  const existingFile = await db.file.findFirst({
    where: { name: fileName, ownerId: ctx.user.id, status: { not: "DELETED" } },
  });

  if (existingFile) {
    await db.file.update({
      where: { id: existingFile.id },
      data: { storageKey, size: htmlBuffer.length, status: "DONE" },
    });
  } else {
    await db.file.create({
      data: {
        name: fileName,
        storageKey,
        slug: storageKey,
        size: htmlBuffer.length,
        contentType: "text/html",
        ownerId: ctx.user.id,
        access: "public",
        url: "",
        status: "DONE",
      },
    });
  }

  // Update website stats
  const stats = await db.file.aggregate({
    where: {
      name: { startsWith: `sites/${websiteId}/` },
      ownerId: ctx.user.id,
      status: "DONE",
    },
    _count: true,
    _sum: { size: true },
  });
  await db.website.update({
    where: { id: websiteId },
    data: { fileCount: stats._count, totalSize: stats._sum.size ?? 0 },
  });

  // Mark as published
  await db.presentation.update({
    where: { id },
    data: { status: "PUBLISHED", websiteId },
  });

  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const url = `${proto}://${slug}.easybits.cloud`;
  return { url, websiteId, slug };
}

export async function unpublishPresentation(ctx: AuthContext, id: string) {
  requireScope(ctx, "WRITE");
  const p = await db.presentation.findUnique({ where: { id } });
  if (!p || p.ownerId !== ctx.user.id) throwJson("Presentation not found", 404);
  if (!p.websiteId) throwJson("Presentation is not published", 400);

  const website = await db.website.findUnique({ where: { id: p.websiteId } });
  if (!website) throwJson("Website not found", 404);

  // Soft-delete website files
  await db.file.updateMany({
    where: {
      name: { startsWith: `sites/${website.id}/` },
      ownerId: ctx.user.id,
      status: { not: "DELETED" },
    },
    data: { status: "DELETED", deletedAt: new Date() },
  });

  // Soft-delete website
  await db.website.update({
    where: { id: website.id },
    data: { status: "DELETED", deletedAt: new Date() },
  });

  // Remove SSL cert
  try {
    await removeHost(`${website.slug}.easybits.cloud`);
  } catch {
    // cert may already be gone
  }

  // Reset presentation to draft
  await db.presentation.update({
    where: { id },
    data: { status: "DRAFT", websiteId: null },
  });

  dispatchWebhooks(ctx.user.id, "website.deleted", {
    id: website.id,
    name: website.name,
    slug: website.slug,
  });

  return { success: true };
}
