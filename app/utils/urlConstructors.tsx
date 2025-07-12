export const createURLFromStorageKey = (
  storageKey: string,
  isPrivate?: boolean
) => {
  const location = isPrivate
    ? "https://easybits-dev.fly.storage.tigris.dev/"
    : "https://easybits-public.fly.storage.tigris.dev";
  return `${location}/${storageKey}`;
};

// Client-side only: get base URL from current location
export const getClientBaseUrl = () => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  throw new Error("getClientBaseUrl should only be called on the client side");
};

// Client-side only: get domain from current location
export const getClientDomain = () => {
  const baseUrl = getClientBaseUrl();
  return new URL(baseUrl).hostname;
};

// Client-side only: construct public link for assets
export const constructPublicLink = (host: string, slug: string) => {
  const domain = getClientDomain();
  return `https://${host}.${domain}/tienda/${slug}`;
};
