import { constructPublicLink } from "~/utils/urlConstructors";

export const usePublicLink = (
  asset: {
    slug: string;
    user?: { host: string };
  },
  host?: string
) => {
  const assetHost = asset.user?.host || host;
  if (!assetHost) {
    return "";
  }
  return constructPublicLink(assetHost, asset.slug);
};
