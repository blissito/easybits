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
  /** Optional typographic scale — pixel sizes (or full descriptors) per role.
   *  When present, every AI generation/regenerate using this kit will be told
   *  to use these EXACT sizes — no per-page improvisation. */
  scale?: {
    h1?: string;       // e.g. "96px"
    h2?: string;       // e.g. "48px"
    h3?: string;       // e.g. "32px"
    body?: string;     // e.g. "22px"
    label?: string;    // e.g. "13px uppercase tracking-wide"
    caption?: string;  // e.g. "14px"
  };
}

export async function listBrandKits(userId: string) {
  return db.brandKit.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
  });
}

async function persistLogoIfNeeded(logoUrl: string | undefined, userId: string) {
  if (!logoUrl || !logoUrl.startsWith("data:")) return logoUrl;
  const { uploadLogoToStorage } = await import("./documentOperations");
  return uploadLogoToStorage(logoUrl, userId);
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
  const logoUrl = await persistLogoIfNeeded(data.logoUrl, userId);
  return db.brandKit.create({
    data: {
      name: data.name,
      colors: data.colors as any,
      fonts: data.fonts as any,
      logoUrl,
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

  const patch: Record<string, unknown> = { ...data };
  if (data.logoUrl !== undefined) patch.logoUrl = await persistLogoIfNeeded(data.logoUrl, userId);
  return db.brandKit.update({ where: { id }, data: patch as any });
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
    typographyScale: f?.scale,
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

/**
 * Build the classification prompt using actual DOM-computed colors and fonts
 * as ground truth. The vision model only CLASSIFIES them (primary vs accent
 * vs surface) using the screenshot as visual context — it never invents hex
 * values. This avoids the "generic purple" hallucination that happens when
 * we ask a vision model to pick colors out of a pixel blob.
 */
function buildExtractPrompt(domColors: string[], domFonts: string[]): string {
  const colorList = domColors.length ? domColors.join(", ") : "(none extracted — fall back to what you see)";
  const fontList = domFonts.length ? domFonts.join(", ") : "(none extracted — infer from the screenshot)";
  return `You are a brand analyst. You've been given a screenshot of a website's homepage AND a deterministic list of colors and fonts scraped directly from its computed CSS.

Computed colors from the DOM (ranked by prominence):
${colorList}

Computed fonts from the DOM:
${fontList}

Your job is to CLASSIFY these — not invent new values. Pick the most brand-representative ones for each slot, using the screenshot to judge visual prominence (logos, CTAs, main sections).

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

Strict rules:
- Every hex MUST come from the computed colors list above, unless the list is empty (then fall back to what you see in the screenshot).
- Every font MUST come from the computed fonts list above, unless the list is empty (then infer a plausible Google Font from the screenshot).
- Use 6-digit lowercase hex.
- primary, secondary, accent should be visually distinct — avoid picking the same hex for three slots. If the palette is limited, it's OK to repeat accent as secondary.
- surface is usually a near-white or near-black from the list. If none of the listed colors matches a plausible page background, use "#ffffff" (site looks light) or "#0a0a0a" (site looks dark) based on the screenshot.`;
}

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

  const { screenshot, candidate, domColors, domFonts } = await withPage(
    async (page) => {
      await page.goto(url.href, { waitUntil: "networkidle", timeout: 20000 }).catch(async () => {
        await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 15000 });
      });
      await page.waitForTimeout(800).catch(() => {});

      const buf = await page.screenshot({ type: "png", fullPage: false });

      // Scrape deterministic brand signals from the DOM: computed colors of
      // key elements + CSS variables + fonts. Passed as ground truth to the
      // vision model so it classifies, doesn't invent.
      const brandSignals = await page.evaluate(() => {
        const toHex = (v: string): string | null => {
          if (!v) return null;
          const trimmed = v.trim();
          if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
          if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
            const h = trimmed.slice(1);
            return "#" + h.split("").map((c) => c + c).join("").toLowerCase();
          }
          const m = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (!m) return null;
          const a = m[4] ? parseFloat(m[4]) : 1;
          if (a < 0.5) return null;
          const r = parseInt(m[1], 10);
          const g = parseInt(m[2], 10);
          const b = parseInt(m[3], 10);
          if ([r, g, b].some((n) => isNaN(n))) return null;
          return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
        };

        // Frequency map — colors that appear on more key elements score higher.
        const freq = new Map<string, number>();
        const bump = (hex: string | null, weight = 1) => {
          if (!hex) return;
          if (hex === "#ffffff" || hex === "#000000") return; // neutrals, excluded
          freq.set(hex, (freq.get(hex) ?? 0) + weight);
        };

        // 1) CSS variables on :root — highest weight (explicit brand tokens).
        try {
          const rootStyle = getComputedStyle(document.documentElement);
          for (let i = 0; i < rootStyle.length; i++) {
            const prop = rootStyle[i];
            if (prop.startsWith("--")) {
              const h = toHex(rootStyle.getPropertyValue(prop));
              if (h) bump(h, 3);
            }
          }
        } catch {}

        // 2) Computed styles on key brand elements.
        const weighted: Array<[string, number]> = [
          ["header", 3], ["nav", 3], ["[role='banner']", 3],
          ["button", 2], ["[class*='btn']", 2], ["[class*='button']", 2], ["[class*='cta']", 2],
          ["[class*='primary']", 3], ["[class*='accent']", 2], ["[class*='brand']", 3],
          ["a", 1], ["h1", 2], ["h2", 1],
          ["body", 2],
        ];
        for (const [sel, weight] of weighted) {
          let nodes: NodeListOf<Element>;
          try { nodes = document.querySelectorAll(sel); } catch { continue; }
          nodes.forEach((el) => {
            const s = getComputedStyle(el);
            for (const prop of ["color", "backgroundColor", "borderColor", "outlineColor"]) {
              bump(toHex(s.getPropertyValue(prop)), weight);
            }
          });
        }

        // 3) Page background for surface — include white/black here since
        // surface often is near-white or near-black.
        const bodyBg = toHex(getComputedStyle(document.body).backgroundColor);

        // Sort by frequency desc, take top 15.
        const sortedColors = Array.from(freq.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([hex]) => hex);

        // 4) Font families — first non-generic on each tier.
        const fontsSet = new Set<string>();
        const firstFamily = (val: string): string | null => {
          if (!val) return null;
          const raw = val.split(",")[0].trim().replace(/^["']|["']$/g, "");
          if (!raw) return null;
          if (/^(sans-serif|serif|monospace|system-ui|cursive|inherit|-apple-system|BlinkMacSystemFont)$/i.test(raw)) return null;
          return raw;
        };
        for (const sel of ["h1", "h2", "h3", "body", "p", "button", "a"]) {
          const el = document.querySelector(sel);
          if (el) {
            const f = firstFamily(getComputedStyle(el).fontFamily);
            if (f) fontsSet.add(f);
          }
        }

        return {
          colors: sortedColors,
          fonts: Array.from(fontsSet).slice(0, 5),
          bodyBg: bodyBg && (bodyBg === "#ffffff" || bodyBg === "#000000" || freq.has(bodyBg)) ? bodyBg : null,
        };
      }).catch(() => ({ colors: [] as string[], fonts: [] as string[], bodyBg: null as string | null }));

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

      // If the scraped body background is near-white or near-black, include it
      // in the color list so the model can pick it as surface.
      const allColors = brandSignals.bodyBg
        ? Array.from(new Set<string>([...brandSignals.colors, brandSignals.bodyBg]))
        : brandSignals.colors;

      return {
        screenshot: buf,
        candidate: cand as LogoCandidate,
        domColors: allColors,
        domFonts: brandSignals.fonts,
      };
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

  // 3) Ask a vision model to classify the DOM-scraped signals against the screenshot.
  const modelId = await getAiModel("docDirections");
  const model = resolveModelLocal(modelId);
  const prompt = buildExtractPrompt(domColors, domFonts);
  const result = streamText({
    model,
    messages: [{
      role: "user",
      content: [
        { type: "image", image: screenshot },
        { type: "text", text: prompt },
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

  // Defensive: if the model picked a color NOT in our list, fall back to the
  // closest one we actually scraped. The goal is zero hallucination.
  if (domColors.length) {
    const allowed = new Set(domColors.map((c) => c.toLowerCase()));
    const pickNearest = (v: string) => {
      const hex = v.toLowerCase();
      if (allowed.has(hex)) return hex;
      // Simple nearest: RGB euclidean distance.
      const toRgb = (h: string) => {
        const s = h.replace("#", "");
        return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
      };
      const target = toRgb(hex);
      let best = domColors[0];
      let bestD = Infinity;
      for (const c of domColors) {
        const [r, g, b] = toRgb(c);
        const d = (r - target[0]) ** 2 + (g - target[1]) ** 2 + (b - target[2]) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      return best;
    };
    parsed.colors.primary = pickNearest(parsed.colors.primary);
    parsed.colors.secondary = pickNearest(parsed.colors.secondary);
    parsed.colors.accent = pickNearest(parsed.colors.accent);
    // surface can legitimately be #ffffff / #000000 even if not in DOM list
    if (parsed.colors.surface && parsed.colors.surface !== "#ffffff" && parsed.colors.surface !== "#0a0a0a" && parsed.colors.surface !== "#000000") {
      if (!allowed.has(parsed.colors.surface.toLowerCase())) {
        parsed.colors.surface = pickNearest(parsed.colors.surface);
      }
    }
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
