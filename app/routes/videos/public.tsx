import { getReadURL } from "react-hook-multipart";
import type { Route } from "./+types/video";
import { data, redirect } from "react-router";

export const loader = async ({ params }: Route.LoaderArgs) => {
  const { storageKey } = params;
  if (!storageKey) throw data({ status: 404 });
  const src = await getReadURL(storageKey);
  return redirect(src);
};
