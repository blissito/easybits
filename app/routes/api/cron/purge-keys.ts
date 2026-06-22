import { data } from "react-router";
import { purgeRevokedApiKeys } from "~/.server/iam";
import type { Route } from "./+types/purge-keys";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;

  // Prefer Authorization header
  const authHeader = request.headers.get("Authorization");
  const headerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  // Backward compat: also check query string (log warning)
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  if (querySecret && !headerSecret) {
    console.warn("purge-keys: secret via query string is deprecated, use Authorization: Bearer header");
  }

  const secret = headerSecret || querySecret;

  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await purgeRevokedApiKeys();
  console.info(`[purge-keys] purged=${result.purged}`);
  return data(result);
};
