type SIZE = "360p" | "480p" | "720p" | "1080p";

export const useStartVersioningFlyMachine = (
  Bucket: string = "easybits-dev"
) => {
  const versionList: SIZE[] = ["360p", "480p", "720p", "1080p"];
  const requestHLS = async (storageKey: string) => {
    const response = await fetch("https://video-converter-hono.fly.dev/start", {
      method: "post",
      headers: {
        "content-type": "application/json",
        "user-agent": "easybits/0.1",
        authorization: "Bearer PerroTOken", // publishable token
      },
      body: JSON.stringify({
        webhook: "https://easybits.cloud/api/v1/conversion_webhook",
        storageKey,
        Bucket,
      }),
    });
    return response.json() as Promise<{
      Bucket: string;
      machineId: string;
      machineName: string;
      playlistURL: string;
      storageKey: string;
      webhook: string;
    }>; // @todo type
  };
  return { requestHLS, versionList };
};
