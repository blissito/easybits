import type { Asset } from "@prisma/client";

export const usePublicLink = (asset: Asset) => {
  if (!asset) return null;

  return `/tienda/${asset.slug}`;
};
