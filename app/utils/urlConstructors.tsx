export const createURLFromStorageKey = (
  storageKey: string,
  isPrivate?: boolean
) => {
  // Serve straight from the Tigris direct endpoint (`*.t3.storage.dev`). The
  // legacy `*.fly.storage.tigris.dev` gateway regressed to serving empty bodies
  // for the public bucket; t3 serves the identical objects.
  const location = isPrivate
    ? "https://easybits-dev.t3.storage.dev"
    : "https://easybits-public.t3.storage.dev";
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
  // Check if we're on the client side
  if (typeof window === "undefined") {
    return "";
  }

  try {
    let domain = getClientDomain();
    // Eliminar 'www.' si está presente al inicio del dominio
    if (domain.startsWith("www.")) {
      domain = domain.replace(/^www\./, "");
    }
    return `https://${host}.${domain}/tienda/${slug}`;
  } catch (error) {
    console.warn("Failed to construct public link:", error);
    return "";
  }
};
