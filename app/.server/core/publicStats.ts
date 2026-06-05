import { getFleetStats } from "./sandboxOperations";

/**
 * Public, unauthenticated platform metrics for the marketing site — mirrors the
 * numbers E2B/Daytona brag about: "started sandboxes" + "monthly downloads".
 *
 * - startedSandboxes: lifetime microVM spawns, from the sandbox-host counter.
 * - monthlyDownloads: last-month npm downloads of our published packages.
 *
 * Cached in-memory (6h) so the homepage never hammers npm or the host.
 */

export interface PublicStats {
  startedSandboxes: number;
  runningSandboxes: number;
  monthlyDownloads: number;
}

const NPM_PACKAGES = [
  "@easybits.cloud/sdk",
  "@easybits.cloud/mcp",
  "@easybits.cloud/html-tailwind-generator",
  "@easybits.cloud/email-generator",
];

const TTL_MS = 6 * 60 * 60 * 1000;
let cache: { at: number; data: PublicStats } | null = null;

async function npmMonthlyDownloads(): Promise<number> {
  const counts = await Promise.all(
    NPM_PACKAGES.map(async (pkg) => {
      try {
        const r = await fetch(
          `https://api.npmjs.org/downloads/point/last-month/${pkg}`
        );
        if (!r.ok) return 0;
        const j = (await r.json()) as { downloads?: number };
        return j.downloads ?? 0;
      } catch {
        return 0;
      }
    })
  );
  return counts.reduce((a, b) => a + b, 0);
}

export async function getPublicStats(): Promise<PublicStats> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const [fleet, downloads] = await Promise.all([
    getFleetStats().catch(() => ({ totalStarted: 0, running: 0 })),
    npmMonthlyDownloads().catch(() => 0),
  ]);
  const data: PublicStats = {
    startedSandboxes: fleet.totalStarted,
    runningSandboxes: fleet.running,
    monthlyDownloads: downloads,
  };
  cache = { at: Date.now(), data };
  return data;
}
