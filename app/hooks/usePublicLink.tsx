import { constructPublicLink } from "~/utils/urlConstructors";

export const usePublicLink = (asset: {
  slug: string;
  user: { host: string };
}) => {
  return constructPublicLink(asset.user.host, asset.slug);
};
