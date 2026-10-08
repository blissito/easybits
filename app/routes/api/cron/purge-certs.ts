import { data } from "react-router";
import { purgeOrphanedCerts } from "~/.server/core/certOperations";
import type { Route } from "./+types/purge-certs";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const expected = process.env.CRON_SECRET;

  const authHeader = request.headers.get("Authorization");
  const headerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  if (querySecret && !headerSecret) {
    console.warn("purge-certs: secret via query string is deprecated, use Authorization: Bearer header");
  }

  const secret = headerSecret || querySecret;
  if (!expected || secret !== expected) {
    throw data({ error: "Unauthorized" }, { status: 401 });
  }

  // Fuera de Fly (sandbox-host) no hay certs de Fly que purgar: el comodín lo emite acme.sh.
  // 200 para que el workflow semanal no se ponga rojo.
  if (!process.env.FLY_API_TOKEN) {
    return data({ skipped: "no FLY_API_TOKEN" });
  }

  const result = await purgeOrphanedCerts();
  console.info(`[purge-certs] total=${result.totalFlyCerts} orphans=${result.orphanedCerts.length} purged=${result.purged}`);
  return data(result);
};
