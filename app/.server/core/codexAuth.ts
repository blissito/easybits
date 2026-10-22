import type { AuthContext } from "../apiAuth";
import { db } from "../db";
import { createSecret, getSecretValue } from "./secretOperations";
import { execCommand } from "./sandboxOperations";

// «Codex con tu plan de ChatGPT» en las cajas del usuario, sin pasos manuales: la sesión de
// Codex (`~/.codex/auth.json`, la que deja `codex login`) vive en el vault como CODEX_AUTH y
// se pone en una caja con una llamada.
//
// Sólo CAJAS del usuario: es la «transferencia de credencial a tu VM» que OpenAI documenta
// para apps open source. Los agentes de la Flota NO la usan (OpenAI exige aprobación para
// apps de paga o alojadas; pedida el 22-oct-2026).
//
// OpenAI ROTA el refresh token al renovar: una copia vieja del vault deja de servir en cuanto
// una caja renueva. Por eso (1) nunca se pisa la sesión que ya tiene una caja, y (2) `save`
// (y el borrado de la caja) devuelve al vault la versión más nueva.
export const CODEX_AUTH_SECRET = "CODEX_AUTH";

export type CodexAuth = {
  tokens?: { refresh_token?: string; access_token?: string; id_token?: string; account_id?: string };
  last_refresh?: string;
  OPENAI_API_KEY?: string | null;
};

/** Valida que sea una sesión de Codex con ChatGPT (no una llave de API ni basura). */
export function parseCodexAuth(raw: string): CodexAuth {
  let j: CodexAuth;
  try {
    j = JSON.parse(raw) as CodexAuth;
  } catch {
    throw new Error("CODEX_AUTH no es JSON: debe ser el contenido de ~/.codex/auth.json tal cual");
  }
  if (!j?.tokens?.refresh_token || !j.tokens.access_token) {
    throw new Error("CODEX_AUTH no trae una sesión de ChatGPT (faltan tokens): haz `codex login` y usa ese ~/.codex/auth.json");
  }
  return j;
}

/** true si `a` es más nueva que `b` (por last_refresh; si no hay fecha, cuenta el token distinto). */
export function isNewer(a: CodexAuth, b: CodexAuth | null): boolean {
  if (!b) return true;
  if (a.tokens?.refresh_token === b.tokens?.refresh_token) return false;
  const ta = Date.parse(a.last_refresh ?? "");
  const tb = Date.parse(b.last_refresh ?? "");
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta > tb;
  return true;
}

// La sesión entra por stdin (nunca en el argv: se vería en `ps`) y se escribe con umask 077.
// Sin `force`, si la caja ya tiene una sesión no se toca: puede ser más nueva que el vault.
const WRITE_SCRIPT = `set -e
d="$HOME/.codex"; f="$d/auth.json"
mkdir -p "$d"
if [ -s "$f" ] && [ "$FORCE" != 1 ]; then cat >/dev/null; echo kept; exit 0; fi
umask 077; cat > "$f.tmp"; mv "$f.tmp" "$f"; chmod 600 "$f"; echo written`;

const INSTALL_SCRIPT = `if command -v codex >/dev/null 2>&1; then echo present
elif command -v npm >/dev/null 2>&1; then npm i -g @openai/codex >/dev/null 2>&1 && echo installed || echo install_failed
else echo no_npm; fi`;

export async function connectCodex(ctx: AuthContext, sandboxId: string, opts: { force?: boolean; install?: boolean } = {}) {
  const raw = await getSecretValue(ctx.user.id, CODEX_AUTH_SECRET).catch(() => null);
  if (!raw) {
    throw new Error(
      "No hay sesión de Codex en tu vault. Haz el login una vez en una caja (`codex login --device-auth`) y guárdala con codex save, o pega tu ~/.codex/auth.json como secreto CODEX_AUTH.",
    );
  }
  parseCodexAuth(raw);
  const w = await execCommand(ctx, sandboxId, { command: WRITE_SCRIPT, stdin: raw, env: { FORCE: opts.force ? "1" : "0" }, timeoutSeconds: 30 });
  if (w.exitCode !== 0) throw new Error(`no se pudo escribir la sesión en la caja: ${(w.stderr || w.stdout || "").slice(0, 200)}`);
  const session = w.stdout.trim().endsWith("kept") ? "kept" : "written";
  let codex: string | undefined;
  if (opts.install !== false) {
    const i = await execCommand(ctx, sandboxId, { command: INSTALL_SCRIPT, timeoutSeconds: 240 });
    codex = i.stdout.trim().split("\n").pop();
  }
  return {
    sandboxId,
    session, // "written" = se puso la del vault · "kept" = la caja ya tenía una (no se pisó; usa force para reemplazarla)
    ...(codex ? { codex } : {}), // present | installed | install_failed | no_npm
    path: "~/.codex/auth.json",
  };
}

export async function saveCodex(ctx: AuthContext, sandboxId: string) {
  const r = await execCommand(ctx, sandboxId, { command: `cat "$HOME/.codex/auth.json" 2>/dev/null || true`, timeoutSeconds: 20 });
  const raw = r.stdout.trim();
  if (!raw) throw new Error("La caja no tiene sesión de Codex (~/.codex/auth.json). Haz `codex login --device-auth` en ella primero.");
  const box = parseCodexAuth(raw);
  const current = await getSecretValue(ctx.user.id, CODEX_AUTH_SECRET).catch(() => null);
  const vault = current ? (() => { try { return parseCodexAuth(current); } catch { return null; } })() : null;
  if (!isNewer(box, vault)) return { sandboxId, saved: false, reason: "el vault ya tiene esta sesión o una más nueva" };
  await createSecret(ctx.user.id, { name: CODEX_AUTH_SECRET, value: raw });
  return { sandboxId, saved: true, lastRefresh: box.last_refresh ?? null };
}

/**
 * Antes de destruir una caja por la API: si el dueño usa CODEX_AUTH y la caja trae una sesión
 * más nueva (Codex la renovó), se guarda. Nunca bloquea el borrado.
 */
export async function saveCodexBeforeDestroy(ctx: AuthContext, sandboxId: string) {
  try {
    const has = await db.secret.findUnique({
      where: { userId_name: { userId: ctx.user.id, name: CODEX_AUTH_SECRET } },
      select: { id: true },
    });
    if (!has) return;
    await Promise.race([saveCodex(ctx, sandboxId), new Promise((r) => setTimeout(r, 8_000))]);
  } catch {
    /* caja sin sesión, dormida o caída: el borrado sigue */
  }
}
