import { db } from "../db";
import { withPage } from "./browserPool";
import { getAiModel, resolveModelLocal } from "../aiModels";
import { streamText } from "ai";

interface BrandKitColors {
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
  extras?: Array<{ name: string; hex: string }>;
}

interface BrandKitFonts {
  heading: string;
  body: string;
}

export async function listBrandKits(userId: string) {
  return db.brandKit.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createBrandKit(
  userId: string,
  data: {
    name: string;
    colors: BrandKitColors;
    fonts?: BrandKitFonts;
    logoUrl?: string;
    mood?: string;
    isDefault?: boolean;
  }
) {
  if (data.isDefault) {
    await db.brandKit.updateMany({
      where: { ownerId: userId, isDefault: true },
      data: { isDefault: false },
    });
  }
  return db.brandKit.create({
    data: {
      name: data.name,
      colors: data.colors as any,
      fonts: data.fonts as any,
      logoUrl: data.logoUrl,
      mood: data.mood,
      isDefault: data.isDefault ?? false,
      ownerId: userId,
    },
  });
}

export async function updateBrandKit(
  id: string,
  userId: string,
  data: {
    name?: string;
    colors?: BrandKitColors;
    fonts?: BrandKitFonts;
    logoUrl?: string;
    mood?: string;
    isDefault?: boolean;
  }
) {
  const kit = await db.brandKit.findUnique({ where: { id } });
  if (!kit || kit.ownerId !== userId) throw new Error("Not found");

  if (data.isDefault) {
    await db.brandKit.updateMany({
      where: { ownerId: userId, isDefault: true },
      data: { isDefault: false },
    });
  }

  return db.brandKit.update({ where: { id }, data: data as any });
}

export async function deleteBrandKit(id: string, userId: string) {
  const kit = await db.brandKit.findUnique({ where: { id } });
  if (!kit || kit.ownerId !== userId) throw new Error("Not found");
  return db.brandKit.delete({ where: { id } });
}

export function brandKitToDirection(kit: {
  colors: any;
  fonts?: any;
  mood?: string | null;
}) {
  const c = kit.colors as BrandKitColors;
  const f = kit.fonts as BrandKitFonts | undefined;
  return {
    colors: {
      primary: c.primary,
      accent: c.accent,
      surface: c.surface,
      surfaceAlt: c.secondary,
      text: "#1a1a1a",
    },
    headingFont: f?.heading,
    bodyFont: f?.body,
    mood: kit.mood || undefined,
    extras: c.extras,
  };
}

export async function getBrandKit(id: string, userId: string) {
  const kit = await db.brandKit.findUnique({ where: { id } });
  if (!kit || kit.ownerId !== userId) throw new Error("Brand kit not found");
  return kit;
}

export async function getDefaultBrandKit(userId: string) {
  return db.brandKit.findFirst({
    where: { ownerId: userId, isDefault: true },
  });
}

/**
 * Returns the brand kit for the given id (validated ownership) or the user's default.
 * Returns null if neither is available. Used by document/landing operations to
 * auto-apply the user's default brand kit when no id is explicitly passed.
 */
export async function resolveBrandKit(userId: string, brandKitId?: string) {
  if (brandKitId) return getBrandKit(brandKitId, userId);
  return getDefaultBrandKit(userId);
}

export async function extractFromDocument(
  landingId: string,
  userId: string,
  name: string
) {
  const landing = await db.landing.findUnique({ where: { id: landingId } });
  if (!landing || landing.ownerId !== userId) throw new Error("Not found");

  const meta = (landing.metadata as Record<string, unknown>) || {};
  const customColors = meta.customColors as BrandKitColors | undefined;
  const direction = meta.direction as Record<string, unknown> | undefined;
  const logoUrl = meta.logoUrl as string | undefined;

  const colors: BrandKitColors = customColors || {
    primary: (direction?.colors as any)?.primary || "#6366f1",
    secondary: (direction?.colors as any)?.accent || "#8b5cf6",
    accent: (direction?.colors as any)?.accent || "#f59e0b",
    surface: (direction?.colors as any)?.surface || "#f8fafc",
  };

  const fonts: BrandKitFonts | undefined = direction
    ? {
        heading: (direction.headingFont as string) || "Inter",
        body: (direction.bodyFont as string) || "Inter",
      }
    : undefined;

  const mood = (direction?.mood as string) || undefined;

  return createBrandKit(userId, { name, colors, fonts, logoUrl, mood });
}

const EXTRACT_URL_PROMPT = `You are a brand analyst. Given a screenshot of a website's homepage, extract its visual identity.

Return ONLY a JSON object with this exact shape — no markdown, no prose:
{
  "colors": {
    "primary": "#hex",     // dominant brand color (logo, main CTA, headers)
    "secondary": "#hex",   // supporting color (secondary CTAs, accents)
    "accent": "#hex",      // highlight/pop color (badges, links, emphasis)
    "surface": "#hex"      // background color (body bg, card bg)
  },
  "fonts": {
    "heading": "Font Name",
    "body": "Font Name"
  },
  "mood": "professional" | "playful" | "elegant" | "bold" | "minimal" | "warm" | "vibrant" | "dark"
}

Rules:
- Use 6-digit lowercase hex.
- If the site is predominantly dark, surface should be the dark color, not white.
- If unsure of fonts, guess from visual characteristics (serif/sans-serif, geometric/humanist) and pick a common web font (Inter, Poppins, Lora, Playfair Display, Roboto, etc.).
- primary/secondary/accent must be visually distinct — do not repeat the same hex.`;

export async function extractFromUrl(
  userId: string,
  opts: {
    url: string;
    name?: string;
    isDefault?: boolean;
  }
) {
  let url: URL;
  try {
    url = new URL(opts.url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http/https URLs are supported");

  // 1) Capture screenshot + scrape logo candidate (url, inline SVG, or bbox to crop).
  type LogoCandidate =
    | { kind: "url"; value: string }
    | { kind: "svg"; value: string }
    | { kind: "crop"; box: { x: number; y: number; w: number; h: number } }
    | null;

  const { screenshot, candidate } = await withPage(
    async (page) => {
      await page.goto(url.href, { waitUntil: "networkidle", timeout: 20000 }).catch(async () => {
        await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 15000 });
      });
      await page.waitForTimeout(800).catch(() => {});

      const buf = await page.screenshot({ type: "png", fullPage: false });

      const cand: LogoCandidate = await page.evaluate(() => {
        const abs = (u: string | null | undefined) => {
          if (!u) return null;
          try { return new URL(u, document.baseURI).href; } catch { return null; }
        };
        const hasLogo = (el: Element | null | undefined): boolean => {
          if (!el) return false;
          const attrs = [
            (el as HTMLElement).className?.toString() || "",
            el.id || "",
            (el as HTMLImageElement).alt || "",
            (el as HTMLImageElement).src || "",
            el.getAttribute("aria-label") || "",
            el.getAttribute("title") || "",
          ].join(" ");
          return /logo|brand/i.test(attrs);
        };

        // Collect home-link anchors (logo is usually inside <a href="/">).
        const homeAnchors = new Set<HTMLAnchorElement>();
        const origin = location.origin;
        document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
          try {
            const h = new URL(a.href);
            if (h.origin === origin && (h.pathname === "/" || h.pathname === "")) homeAnchors.add(a);
          } catch {}
        });

        // 1) <img> in header/nav where self or any ancestor (up 5) mentions logo/brand.
        const scoped = Array.from(
          document.querySelectorAll<HTMLImageElement>("header img, nav img, [role='banner'] img")
        );
        for (const img of scoped) {
          if (!img.src) continue;
          let el: Element | null = img;
          for (let i = 0; i < 6 && el; i++) {
            if (hasLogo(el)) return { kind: "url" as const, value: abs(img.src)! };
            el = el.parentElement;
          }
        }

        // 2) <img> inside a home anchor.
        for (const a of homeAnchors) {
          const img = a.querySelector<HTMLImageElement>("img");
          if (img?.src) return { kind: "url" as const, value: abs(img.src)! };
        }

        // 3) Inline <svg> inside a home anchor or a "logo"/"brand" container. Return its outerHTML.
        const svgCandidates: SVGSVGElement[] = [];
        for (const a of homeAnchors) {
          const s = a.querySelector<SVGSVGElement>("svg");
          if (s) svgCandidates.push(s);
        }
        document
          .querySelectorAll<SVGSVGElement>("header svg, nav svg, [role='banner'] svg")
          .forEach((s) => {
            let el: Element | null = s;
            for (let i = 0; i < 6 && el; i++) {
              if (hasLogo(el)) { svgCandidates.push(s); return; }
              el = el.parentElement;
            }
          });
        if (svgCandidates.length) {
          const svg = svgCandidates[0];
          const serialized = new XMLSerializer().serializeToString(svg);
          const withNs = /xmlns=/.test(serialized)
            ? serialized
            : serialized.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
          return { kind: "svg" as const, value: withNs };
        }

        // 4) Anything visible inside a home anchor — return its bounding box to crop from the screenshot.
        for (const a of homeAnchors) {
          const rect = a.getBoundingClientRect();
          if (rect.width > 20 && rect.height > 12 && rect.width < 600 && rect.height < 200 && rect.top < 200) {
            return {
              kind: "crop" as const,
              box: { x: Math.max(0, rect.left), y: Math.max(0, rect.top), w: rect.width, h: rect.height },
            };
          }
        }

        // 5) apple-touch-icon.
        const apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]');
        if (apple?.href) return { kind: "url" as const, value: abs(apple.href)! };

        // 6) Highest-res favicon.
        const icons = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
        if (icons.length) {
          const scored = icons
            .map((l) => {
              const sizes = l.getAttribute("sizes") || "";
              const m = sizes.match(/(\d+)x\d+/);
              const size = m ? parseInt(m[1], 10) : 0;
              const type = l.getAttribute("type") || "";
              const typeScore = /png/i.test(type) ? 2 : /svg/i.test(type) ? 3 : 1;
              return { href: l.href, score: size * 10 + typeScore };
            })
            .sort((a, b) => b.score - a.score);
          if (scored[0]?.href) return { kind: "url" as const, value: abs(scored[0].href)! };
        }

        return null;
      }).catch(() => null as LogoCandidate);

      return { screenshot: buf, candidate: cand as LogoCandidate };
    },
    { viewport: { width: 1440, height: 900 } }
  );

  // 2) Normalize the candidate to a data URL (fetch url / serialize svg / crop screenshot), then upload to Tigris.
  const { uploadLogoToStorage } = await import("./documentOperations");
  let logoUrl: string | undefined;
  try {
    let dataUrl: string | null = null;
    if (candidate?.kind === "url") {
      const res = await fetch(candidate.value);
      if (res.ok) {
        const ct = (res.headers.get("content-type") || "image/png").split(";")[0].trim();
        const buf = Buffer.from(await res.arrayBuffer());
        dataUrl = `data:${ct};base64,${buf.toString("base64")}`;
      }
    } else if (candidate?.kind === "svg") {
      const svg = candidate.value;
      dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
    } else if (candidate?.kind === "crop") {
      const sharp = (await import("sharp")).default;
      const { box } = candidate;
      const cropped = await sharp(screenshot)
        .extract({
          left: Math.round(box.x),
          top: Math.round(box.y),
          width: Math.max(1, Math.round(box.w)),
          height: Math.max(1, Math.round(box.h)),
        })
        .png()
        .toBuffer();
      dataUrl = `data:image/png;base64,${cropped.toString("base64")}`;
    } else {
      // Fallback: crop the top-left region of the screenshot (common logo placement).
      const sharp = (await import("sharp")).default;
      const cropped = await sharp(screenshot)
        .extract({ left: 0, top: 0, width: 500, height: 140 })
        .png()
        .toBuffer();
      dataUrl = `data:image/png;base64,${cropped.toString("base64")}`;
    }
    if (dataUrl) logoUrl = await uploadLogoToStorage(dataUrl, userId);
  } catch {
    // Best-effort; leave logoUrl undefined if upload fails.
  }

  // 3) Ask a vision model for the palette + fonts + mood.
  const modelId = await getAiModel("docDirections");
  const model = resolveModelLocal(modelId);
  const result = streamText({
    model,
    messages: [{
      role: "user",
      content: [
        { type: "image", image: screenshot },
        { type: "text", text: EXTRACT_URL_PROMPT },
      ],
    }],
  });
  const raw = await result.text;
  let parsed: { colors: BrandKitColors; fonts?: BrandKitFonts; mood?: string };
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no json");
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("Could not parse brand extraction — try again or create the kit manually");
  }

  const name = (opts.name && opts.name.trim()) || url.hostname.replace(/^www\./, "");

  return createBrandKit(userId, {
    name,
    colors: parsed.colors,
    fonts: parsed.fonts,
    logoUrl: logoUrl || undefined,
    mood: parsed.mood,
    isDefault: opts.isDefault,
  });
}
