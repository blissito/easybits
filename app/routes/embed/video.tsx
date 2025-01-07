import { getReadURL } from "~/.server/tigris";
import type { Route } from "./+types/video";

export const loader = async ({ params }: Route.LoaderArgs) => {
  const { storageKey } = params;
  if (!storageKey) throw new Response(null, { status: 404 });

  return {
    src: await getReadURL(storageKey),
  };
};
export default function Route({ loaderData }: Route.ComponentProps) {
  const { src } = loaderData;
  return (
    <article className="h-screen">
      <video src={src} className="w-full h-full" controls />
    </article>
  );
}
