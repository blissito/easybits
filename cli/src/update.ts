// ¿Hay versión nueva en npm? Como `npm`/`gh` (y la CLI hermana `ghosty` desde su 0.10): una
// consulta al registro a lo más una vez por hora, guardada en ~/.config/easybits/update.json,
// y el aviso a stderr, nunca en --json ni sin terminal. `EASYBITS_NO_UPDATE_CHECK=1` o `CI`
// la apagan. Nació en ghosty de una versión vieja que fallaba con «Unknown option» sin decir
// que ya existía la que tenía esa bandera.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { t } from "./i18n.js";

const FILE = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "easybits", "update.json");
// Una hora, no un día (igual que `ghosty` 0.31): en días de varias versiones, un caché de 24 h
// dejaba a una versión vieja sin aviso en decenas de llamadas (feedback Acali #1, Deník Leads #9).
const TTL = 60 * 60 * 1000;
export const UPGRADE = "npm i -g @easybits.cloud/cli@latest";

export type Cache = { latest?: string; checkedAt?: number };

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

/** ¿Sirve el caché? Vencido (más de una hora) o MÁS VIEJO que lo instalado no sabe nada. */
export function cacheFresh(c: Cache, current?: string, now = Date.now()): boolean {
  if (!c.latest || !c.checkedAt || now - c.checkedAt >= TTL) return false;
  // Instalaste una versión más nueva que la que dice el caché: vuelve a preguntar.
  return !(current && current !== "dev" && newer(current, c.latest));
}

/** La última conocida: del caché, refrescándolo si tiene más de una hora o quedó atrás. */
export async function latestVersion(current?: string): Promise<string | null> {
  if (updateCheckDisabled()) return null;
  const c = readCache();
  if (cacheFresh(c, current)) return c.latest!;
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
  const latest = await latestVersion(current);
  return latest && newer(latest, current) ? t(`Update available: ${current} → ${latest}. Run: ${UPGRADE}`, `Hay versión nueva: ${current} → ${latest}. Corre: ${UPGRADE}`) : null;
}
