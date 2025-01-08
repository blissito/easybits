import { getReadURL } from "~/.server/tigris";
import type { Route } from "./+types/video";
import { redirect } from "react-router";

export const loader = async ({ params }: Route.LoaderArgs) => {
  const { storageKey } = params;
  if (!storageKey) throw new Response(null, { status: 404 });
  const src = await getReadURL(storageKey);
  return redirect(src);
};
