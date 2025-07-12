import { config } from "./config";

// Server-side only: get base URL from environment
export const getServerBaseUrl = () => {
  return config.baseUrl;
};

// Server-side only: get domain from environment
export const getServerDomain = () => {
  return new URL(config.baseUrl).hostname;
};

// Server-side only: construct public link for assets
export const constructServerPublicLink = (host: string, slug: string) => {
  const domain = getServerDomain();
  return `https://${host}.${domain}/tienda/${slug}`;
};
