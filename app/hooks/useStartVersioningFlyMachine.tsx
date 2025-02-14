type SIZE = "360p" | "480p" | "720p" | "1080p";

export const useStartVersioningFlyMachine = (
  Bucket: string = "easybits-dev"
) => {
  const versionList: SIZE[] = ["360p", "480p", "720p", "1080p"];
  const startVersionFor = async (sizeName: SIZE, storageKey: string) =>
    fetch("https://video-converter-hono.fly.dev/start", {
      method: "post",
      headers: {
        "content-type": "application/json",
        "user-agent": "easybits/0.1",
        authorization: "Bearer PerroTOken",
      },
      body: JSON.stringify({
        webhook: "https://easybits.cloud/api/v1/conversion_webhook",
        storageKey,
        sizeName,
        Bucket,
      }),
    });
  return { startVersionFor, versionList };
};
