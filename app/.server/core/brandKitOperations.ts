import { db } from "../db";

interface BrandKitColors {
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
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
  };
}

export async function getBrandKit(id: string, userId: string) {
  const kit = await db.brandKit.findUnique({ where: { id } });
  if (!kit || kit.ownerId !== userId) throw new Error("Brand kit not found");
  return kit;
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
