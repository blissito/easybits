import { nanoid } from "nanoid";
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { getPlatformDefaultClient, PUBLIC_BUCKET } from "../storage";
import { createWebsite } from "./operations";
import { buildLandingHtml } from "~/lib/buildLandingHtml";
import { buildLandingHtml2 } from "~/lib/landing2/buildLandingHtml2";
import { buildDeployHtml } from "~/lib/landing3/buildHtml";
import { buildDeployHtmlV4 } from "~/lib/landing4/buildHtml";
import { buildDocumentHtml, buildDocumentPrintHtml } from "~/lib/documents/buildHtml";
import { getUserPlan, isPaidPlan } from "~/lib/plans";
import { buildSingleThemeCss, buildCustomTheme } from "@easybits.cloud/html-tailwind-generator";
import type { LandingSection } from "~/lib/landingCatalog";
import type { LandingBlock } from "~/lib/landing2/blockTypes";
import type { Section3 } from "~/lib/landing3/types";
import { createHost, removeHost } from "~/lib/fly_certs/certs_getters";
import { dispatchWebhooks } from "../webhooks";
import { replaceCdnWithCompiledCSS } from "../tailwind";

function throwJson(error: string, status: number): never {
  throw new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function deployLanding(ctx: AuthContext, id: string) {
  requireScope(ctx, "WRITE");
  const landing = await db.landing.findUnique({ where: { id } });
  if (!landing || landing.ownerId !== ctx.user.id)
    throwJson("Landing not found", 404);

  const sections = (landing.sections as unknown as any[]) || [];
  if (sections.length === 0) throwJson("No sections to deploy", 400);

  const customColors = landing.customColors as { bg: string; accent: string; text: string } | null;
  const landingMeta = (landing.metadata as Record<string, unknown>) || {};
  const isPaid = isPaidPlan(getUserPlan(ctx.user));
  // For documents (version 4), we also build a print HTML for PDF generation
  let printHtml: string | undefined;
  const html = landing.version === 4
    ? (() => {
        const docTheme = (landingMeta.theme as string) || undefined;
        let themeCss: string | undefined;
        let tailwindConfig: string | undefined;
        if (docTheme === "custom" && landingMeta.customColors) {
          const t = buildCustomTheme(landingMeta.customColors as any);
          themeCss = `:root {\n${Object.entries(t.colors).map(([k, v]) => `  --color-${k}: ${v};`).join("\n")}\n}`;
          tailwindConfig = buildSingleThemeCss("minimal").tailwindConfig;
        } else if (docTheme) {
          const docThemeCss = buildSingleThemeCss(docTheme);
          themeCss = docThemeCss.css;
          tailwindConfig = docThemeCss.tailwindConfig;
        }
        // Build print HTML (flat vertical for PDF generation)
        printHtml = buildDocumentPrintHtml(sections as Section3[], {
          themeCss,
          tailwindConfig,
          title: landing.name,
        });
        // Build flipbook viewer (pdfUrl will be set after upload)
        return buildDocumentHtml(sections as Section3[], {
          showBranding: !isPaid,
          themeCss,
          tailwindConfig,
          title: landing.name,
          description: landing.prompt || undefined,
        });
      })()
    : landing.version === 5
    ? buildDeployHtmlV4(sections as Section3[], {
        showBranding: !isPaid,
        title: landing.name,
        themeName: (landingMeta.theme as string) || undefined,
        customColors: (landingMeta.customColors as Record<string, string>) || undefined,
      })
    : landing.version === 3
    ? buildDeployHtml(sections as Section3[], (landingMeta.theme as string) || undefined, (landingMeta.customColors as any) || undefined, !isPaid)
    : landing.version === 2
    ? buildLandingHtml2(sections as LandingBlock[], landing.theme, customColors)
    : buildLandingHtml(sections as LandingSection[], landing.theme, customColors);

  // Compile Tailwind server-side for versions that use CDN (v4 docs, v5 landings)
  const needsCompile = landing.version === 4 || landing.version === 5;
  const finalHtml = needsCompile ? await replaceCdnWithCompiledCSS(html) : html;
  const finalPrintHtml = printHtml && needsCompile ? await replaceCdnWithCompiledCSS(printHtml) : printHtml;
  const htmlBuffer = Buffer.from(finalHtml, "utf-8");

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

  // Upload print.html + generate PDF for documents
  let pdfUrl: string | undefined;
  if (finalPrintHtml) {
    const printBuffer = Buffer.from(finalPrintHtml, "utf-8");
    const printStorageKey = `${ctx.user.id}/${nanoid(6)}`;
    const printPublicUrl = `https://${PUBLIC_BUCKET}.fly.storage.tigris.dev/mcp/${printStorageKey}`;
    const printPutUrl = await client.getPutUrl(printStorageKey);
    const printUploadRes = await fetch(printPutUrl, {
      method: "PUT",
      body: printBuffer,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    if (printUploadRes.ok) {
      // Upsert print.html file record
      const printFileName = `sites/${websiteId}/print.html`;
      const existingPrint = await db.file.findFirst({
        where: { name: printFileName, ownerId: ctx.user.id, status: { not: "DELETED" } },
      });
      if (existingPrint) {
        await db.file.update({
          where: { id: existingPrint.id },
          data: { storageKey: printStorageKey, size: printBuffer.length, status: "DONE", url: printPublicUrl },
        });
      } else {
        await db.file.create({
          data: { name: printFileName, storageKey: printStorageKey, slug: printStorageKey, size: printBuffer.length, contentType: "text/html", ownerId: ctx.user.id, access: "public", url: printPublicUrl, status: "DONE" },
        });
      }
    }

    // Generate PDF via Gotenberg (HTML→PDF via URL)
    const pdfServiceUrl = process.env.PDF_SERVICE_URL;
    if (pdfServiceUrl) {
      try {
        const formData = new FormData();
        formData.append("url", `https://${slug!}.easybits.cloud/print.html`);
        formData.append("printBackground", "true");
        formData.append("paperWidth", "8.5");
        formData.append("paperHeight", "11");
        formData.append("marginTop", "0");
        formData.append("marginBottom", "0");
        formData.append("marginLeft", "0");
        formData.append("marginRight", "0");
        formData.append("waitDelay", "3s");
        const pdfRes = await fetch(pdfServiceUrl, {
          method: "POST",
          body: formData,
        });
        if (pdfRes.ok) {
          const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
          const pdfStorageKey = `${ctx.user.id}/${nanoid(6)}`;
          const pdfPublicUrl = `https://${PUBLIC_BUCKET}.fly.storage.tigris.dev/mcp/${pdfStorageKey}`;
          const pdfPutUrl = await client.getPutUrl(pdfStorageKey);
          const pdfUploadRes = await fetch(pdfPutUrl, {
            method: "PUT",
            body: pdfBuffer,
            headers: { "Content-Type": "application/pdf" },
          });
          if (pdfUploadRes.ok) {
            pdfUrl = pdfPublicUrl;
            // Upsert PDF file record
            const pdfFileName = `sites/${websiteId}/document.pdf`;
            const existingPdf = await db.file.findFirst({
              where: { name: pdfFileName, ownerId: ctx.user.id, status: { not: "DELETED" } },
            });
            if (existingPdf) {
              await db.file.update({
                where: { id: existingPdf.id },
                data: { storageKey: pdfStorageKey, size: pdfBuffer.length, status: "DONE", url: pdfPublicUrl },
              });
            } else {
              await db.file.create({
                data: { name: pdfFileName, storageKey: pdfStorageKey, slug: pdfStorageKey, size: pdfBuffer.length, contentType: "application/pdf", ownerId: ctx.user.id, access: "public", url: pdfPublicUrl, status: "DONE" },
              });
            }
          }
        } else {
          console.error(`[deployLanding] PDF generation failed: ${pdfRes.status}`);
        }
      } catch (err) {
        console.error("[deployLanding] PDF generation error:", err);
      }
    }

    // Generate og:image in background (non-blocking) — re-uploads HTML with meta tag when ready
    if (landing.version === 4) {
      const bgSlug = slug!;
      const bgStorageKey = storageKey;
      const bgSections = sections;
      const bgLandingMeta = landingMeta;
      const bgIsPaid = isPaid;
      const bgLandingName = landing.name;
      const bgLandingPrompt = landing.prompt;
      const bgUserId = ctx.user.id;
      const bgLandingId = landing.id;
      const bgExistingFileId = existingFile?.id;

      (async () => {
        try {
          const { takeOgScreenshot } = await import("./documentScreenshot");
          const ssBuffer = await takeOgScreenshot(bgUserId, bgLandingId);
          if (!ssBuffer) {
            console.error("[deployLanding] og:image screenshot failed");
            return;
          }
          const ogStorageKey = `${bgUserId}/${nanoid(6)}`;
          const ogPutUrl = await client.getPutUrl(ogStorageKey);
          const ogUploadRes = await fetch(ogPutUrl, {
            method: "PUT",
            body: new Uint8Array(ssBuffer),
            headers: { "Content-Type": "image/png" },
          });
          if (!ogUploadRes.ok) return;
          const ogImageUrl = `https://${PUBLIC_BUCKET}.fly.storage.tigris.dev/mcp/${ogStorageKey}`;

          // Re-build HTML with og:image
          const { buildDocumentHtml: rebuildDoc } = await import("~/lib/documents/buildHtml");
          const docTheme = (bgLandingMeta.theme as string) || undefined;
          let themeCss: string | undefined;
          let tailwindConfig: string | undefined;
          if (docTheme === "custom" && bgLandingMeta.customColors) {
            const t = buildCustomTheme(bgLandingMeta.customColors as any);
            themeCss = `:root {\n${Object.entries(t.colors).map(([k, v]: [string, unknown]) => `  --color-${k}: ${v};`).join("\n")}\n}`;
            tailwindConfig = buildSingleThemeCss("minimal").tailwindConfig;
          } else if (docTheme) {
            const docThemeCss = buildSingleThemeCss(docTheme);
            themeCss = docThemeCss.css;
            tailwindConfig = docThemeCss.tailwindConfig;
          }
          const updatedHtml = rebuildDoc(bgSections as Section3[], {
            showBranding: !bgIsPaid,
            themeCss,
            tailwindConfig,
            title: bgLandingName,
            description: bgLandingPrompt || undefined,
            url: `https://${bgSlug}.easybits.cloud`,
            ogImage: ogImageUrl,
          });
          const compiledHtml = await replaceCdnWithCompiledCSS(updatedHtml);
          const updatedBuffer = Buffer.from(compiledHtml, "utf-8");
          const reUploadUrl = await client.getPutUrl(bgStorageKey);
          const reUploadRes = await fetch(reUploadUrl, {
            method: "PUT",
            body: updatedBuffer,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
          console.log(`[deployLanding] og:image re-upload status: ${reUploadRes.status}, key: ${bgStorageKey}`);
          if (bgExistingFileId) {
            await db.file.update({ where: { id: bgExistingFileId }, data: { size: updatedBuffer.length } });
          }
          console.log(`[deployLanding] og:image ready: ${ogImageUrl}`);
        } catch (err) {
          console.error("[deployLanding] og:image background error:", err);
        }
      })();
    }
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
  return { url, websiteId, slug, customUrl, pdfUrl };
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

export async function cloneDocument(ctx: AuthContext, documentId: string, newName?: string) {
  requireScope(ctx, "WRITE");
  const landing = await db.landing.findUnique({ where: { id: documentId } });
  if (!landing || landing.ownerId !== ctx.user.id || landing.version !== 4)
    throwJson("Document not found", 404);

  const clone = await db.landing.create({
    data: {
      name: newName || `${landing.name} (copia)`,
      ownerId: ctx.user.id,
      version: 4,
      theme: landing.theme,
      customColors: landing.customColors as any,
      sections: landing.sections as any,
      metadata: landing.metadata as any,
      prompt: landing.prompt,
    },
  });
  return clone;
}
