import { config } from "~/.server/config";

export const usePublicLink = (asset: {
  slug: string;
  user: { host: string };
}) => {
  const domain = new URL(config.baseUrl).hostname;
  return `https://${asset.user.host}.${domain}/tienda/${asset.slug}`;
};
