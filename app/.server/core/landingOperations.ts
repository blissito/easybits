import { nanoid } from "nanoid";
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { getPlatformDefaultClient, PUBLIC_BUCKET } from "../storage";
import { createWebsite } from "./operations";
import { buildLandingHtml } from "~/lib/buildLandingHtml";
import { buildLandingHtml2 } from "~/lib/landing2/buildLandingHtml2";
import { buildDeployHtml } from "~/lib/landing3/buildHtml";
import { buildDocumentHtml, buildDocumentViewerHtml } from "~/lib/documents/buildHtml";
import type { LandingSection } from "~/lib/landingCatalog";
import type { LandingBlock } from "~/lib/landing2/blockTypes";
import type { Section3 } from "~/lib/landing3/types";
import { createHost, removeHost } from "~/lib/fly_certs/certs_getters";
import { dispatchWebhooks } from "../webhooks";

function throwJson(error: string, status: number): never {
  throw new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function deployLanding(ctx: AuthContext, id: string, options?: { pdfUrl?: string }) {
  requireScope(ctx, "WRITE");
  const landing = await db.landing.findUnique({ where: { id } });
  if (!landing || landing.ownerId !== ctx.user.id)
    throwJson("Landing not found", 404);

  const sections = (landing.sections as unknown as any[]) || [];
  if (sections.length === 0) throwJson("No sections to deploy", 400);

  const customColors = landing.customColors as { bg: string; accent: string; text: string } | null;
  const landingMeta = (landing.metadata as Record<string, unknown>) || {};
  const isPaidPlan = ctx.user.roles.some((r) => r === "Flow" || r === "Studio");
  const html = landing.version === 4 && options?.pdfUrl
    ? buildDocumentViewerHtml(options.pdfUrl, landing.name, { showBranding: !isPaidPlan })
    : landing.version === 4
    ? buildDocumentHtml(sections as Section3[], { showBranding: !isPaidPlan })
    : landing.version === 3
    ? buildDeployHtml(sections as Section3[], (landingMeta.theme as string) || undefined, (landingMeta.customColors as any) || undefined, !isPaidPlan)
    : landing.version === 2
    ? buildLandingHtml2(sections as LandingBlock[], landing.theme, customColors)
    : buildLandingHtml(sections as LandingSection[], landing.theme, customColors);
  const htmlBuffer = Buffer.from(html, "utf-8");

  // Create or reuse website
  let websiteId = landing.websiteId;
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
    const website = await createWebsite(ctx, { name: landing.name });
    websiteId = website.id;
    slug = website.slug;
  } else {
    slug = slug!;
  }

  // Upload index.html
  const client = getPlatformDefaultClient({ bucket: PUBLIC_BUCKET });
  const storageKey = `${ctx.user.id}/${nanoid(6)}`;
  const publicUrl = `https://${PUBLIC_BUCKET}.fly.storage.tigris.dev/mcp/${storageKey}`;
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
    where: {
      name: fileName,
      ownerId: ctx.user.id,
      status: { not: "DELETED" },
    },
  });

  if (existingFile) {
    await db.file.update({
      where: { id: existingFile.id },
      data: {
        storageKey,
        size: htmlBuffer.length,
        status: "DONE",
        url: publicUrl,
      },
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
        url: publicUrl,
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
  await db.landing.update({
    where: { id },
    data: { status: "PUBLISHED", websiteId },
  });

  // SSL cert for easybits.cloud
  const hostname = `${slug}.easybits.cloud`;
  try {
    if (process.env.FLY_API_TOKEN) {
      await createHost(hostname);
    }
  } catch (err) {
    console.error(
      `[deployLanding] cert creation failed for ${hostname}:`,
      err
    );
  }

  // Also create cert for custom domain if linked
  const website = await db.website.findUnique({
    where: { id: websiteId },
    include: { customDomain: true },
  });
  let customUrl: string | undefined;
  if (website?.customDomain?.verified) {
    const customHostname = `${slug}.${website.customDomain.domain}`;
    try {
      if (process.env.FLY_API_TOKEN) {
        await createHost(customHostname);
      }
      const proto = process.env.NODE_ENV === "production" ? "https" : "http";
      customUrl = `${proto}://${customHostname}`;
    } catch (err) {
      console.error(`[deployLanding] custom domain cert failed for ${customHostname}:`, err);
    }
  }

  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const url = `${proto}://${hostname}`;
  return { url, websiteId, slug, customUrl };
}

export async function unpublishLanding(ctx: AuthContext, id: string) {
  requireScope(ctx, "WRITE");
  const landing = await db.landing.findUnique({ where: { id } });
  if (!landing || landing.ownerId !== ctx.user.id)
    throwJson("Landing not found", 404);
  if (!landing.websiteId) throwJson("Landing is not published", 400);

  const website = await db.website.findUnique({
    where: { id: landing.websiteId },
  });
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

  // Reset to draft
  await db.landing.update({
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
