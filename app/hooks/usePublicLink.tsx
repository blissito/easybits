import type { Asset } from "@prisma/client";

export const usePublicLink = (asset: Asset, host?: string) => {
  if (!asset) return null;

  if (host) {
    return `https://${host}.easybits.cloud/tienda/${asset.slug}`;
  }

  // @todo custom d

  return `/tienda/${asset.slug}`;
};
