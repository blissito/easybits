import { data } from "react-router";
import { purgeDeletedFiles } from "~/.server/core/operations";
import type { Route } from "./+types/purge-files";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await purgeDeletedFiles();
  return data(result);
};
