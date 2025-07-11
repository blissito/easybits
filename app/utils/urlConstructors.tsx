export const createURLFromStorageKey = (
  storageKey: string,
  isPrivate?: boolean
) => {
  const location = isPrivate
    ? "https://easybits-dev.fly.storage.tigris.dev/"
    : "https://easybits-public.fly.storage.tigris.dev";
  return `${location}/${storageKey}`;
};
