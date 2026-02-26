import { getReadURL } from "react-hook-multipart";
import type { Route } from "./+types/video";
import { data, redirect } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  await getUserOrRedirect(request);
  const { storageKey } = params;
  if (!storageKey) throw data({ status: 404 });
  const src = await getReadURL(storageKey);
  return redirect(src);
};
