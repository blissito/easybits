// ¿Hay versión nueva en npm? Como `npm`/`gh` (y la CLI hermana `ghosty` desde su 0.10): una
// consulta al registro a lo más una vez al día, guardada en ~/.config/easybits/update.json,
// y el aviso a stderr, nunca en --json ni sin terminal. `EASYBITS_NO_UPDATE_CHECK=1` o `CI`
// la apagan. Nació en ghosty de una versión vieja que fallaba con «Unknown option» sin decir
// que ya existía la que tenía esa bandera.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const FILE = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "easybits", "update.json");
const DAY = 24 * 60 * 60 * 1000;
export const UPGRADE = "npm i -g @easybits.cloud/cli@latest";

type Cache = { latest?: string; checkedAt?: number };

/** a > b en semver simple (x.y.z; lo que no sea número cuenta como 0). */
export function newer(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

export const updateCheckDisabled = () => Boolean(process.env.EASYBITS_NO_UPDATE_CHECK || process.env.CI);

function readCache(): Cache {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as Cache;
  } catch {
    return {};
  }
}

/** Pregunta a npm ya (sin caché) y guarda. null sin red. */
export async function fetchLatest(timeoutMs = 1500): Promise<string | null> {
  try {
    const r = await fetch("https://registry.npmjs.org/@easybits.cloud/cli/latest", { signal: AbortSignal.timeout(timeoutMs) });
    const latest = ((await r.json()) as { version?: string }).version;
    if (!latest) return null;
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify({ latest, checkedAt: Date.now() }));
    return latest;
  } catch {
    return null;
  }
}

/** La última conocida: del caché, refrescándolo si tiene más de un día. */
export async function latestVersion(): Promise<string | null> {
  if (updateCheckDisabled()) return null;
  const c = readCache();
  if (c.latest && c.checkedAt && Date.now() - c.checkedAt < DAY) return c.latest;
  return (await fetchLatest()) ?? c.latest ?? null;
}

/** Sólo del caché, sin red: para la pista de un error de uso («quizá tu versión es vieja»). */
export function cachedNewer(current: string): string | null {
  if (updateCheckDisabled() || current === "dev") return null;
  const l = readCache().latest;
  return l && newer(l, current) ? l : null;
}

/** Línea de aviso si hay versión nueva; null si estás al día. */
export async function updateNotice(current: string): Promise<string | null> {
  if (current === "dev") return null;
  const latest = await latestVersion();
  return latest && newer(latest, current) ? `Update available: ${current} → ${latest}. Run: ${UPGRADE}` : null;
}
