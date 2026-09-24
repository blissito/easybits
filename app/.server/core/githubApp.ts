/**
 * GitHub App `ghosty-studio` — la MISMA que usa Ghosty Teams para su conector.
 *
 * Aquí sirve para el «conecto el repo y ya está» del hosting: el usuario instala
 * la App eligiendo repos, y con eso EasyBits clona (token de instalación de 1 h,
 * recortado a un repo y de sólo lectura) y recibe cada `push` por el webhook
 * ÚNICO de la App. Sin PAT y sin pegar webhooks a mano.
 *
 * Portado de `ghosty-teams/src/server/connectors/github-app.server.ts`.
 *
 * ⚠️ El callback de instalación NO llega directo aquí: GitHub vuelve al callback
 * registrado en la App, que es el relay de Teams
 * (oauth.teams.ghosty.studio/oauth/github/callback). Ese relay reconoce el
 * `state` con prefijo `eb.` y rebota a /dash/hosting/github/callback.
 *
 * Nace APAGADO: sin `GITHUB_APP_ID` + llave, `githubAppEnabled()` es false y la UI
 * no ofrece importar.
 */
import { createHmac, createSign, timingSafeEqual } from "node:crypto";

const API = "https://api.github.com";
const H = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

export const GITHUB_APP_SLUG = process.env.GITHUB_APP_SLUG ?? "ghosty-studio";
export const STATE_PREFIX = "eb.";

/**
 * La llave como PEM. ⚠️ Preferir SIEMPRE `GITHUB_APP_PRIVATE_KEY_B64`: un PEM con
 * `\n` escapados pasa por capas (systemd, shells) que se comen la barra, y la `n`
 * suelta que queda no se puede reparar en código.
 */
function privateKeyPem(): string | null {
  const b64 = process.env.GITHUB_APP_PRIVATE_KEY_B64;
  if (b64) {
    const pem = Buffer.from(b64, "base64").toString("utf8");
    if (pem.includes("-----BEGIN")) return pem;
  }
  const raw = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!raw) return null;
  const pem = raw.replace(/\\n/g, "\n");
  return pem.includes("-----BEGIN") && pem.includes("\n") ? pem : null;
}

export function githubAppEnabled(): boolean {
  return !!(
    process.env.GITHUB_APP_ID &&
    privateKeyPem() &&
    process.env.GITHUB_CLIENT_ID &&
    process.env.GITHUB_CLIENT_SECRET
  );
}

/** JWT RS256 de la App. `iat` 60 s atrás: GitHub lo rechaza si el reloj va adelantado. */
function appJwt(): string {
  const pem = privateKeyPem();
  if (!pem || !process.env.GITHUB_APP_ID) throw new Error("GitHub App no configurada");
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "RS256", typ: "JWT" });
  const body = b64({ iat: now - 60, exp: now + 540, iss: process.env.GITHUB_APP_ID });
  const signer = createSign("RSA-SHA256");
  signer.update(`${head}.${body}`);
  return `${head}.${body}.${signer.sign(pem, "base64url")}`;
}

// Tokens de instalación: 1 h. Caché con margen de 5 min.
// ⚠️ La clave lleva el alcance completo: servir un token recortado a un repo desde
// la entrada genérica (o al revés) le daría a un repo el alcance de otro.
const cache = new Map<string, { token: string; exp: number }>();

export async function installationToken(
  installationId: number,
  opts?: { onlyRepo?: string; readOnly?: boolean }
): Promise<string> {
  const key = `${installationId}:${opts?.onlyRepo ?? "*"}:${opts?.readOnly ? "ro" : "rw"}`;
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.exp - now > 300_000) return hit.token;
  const body =
    opts?.onlyRepo || opts?.readOnly
      ? JSON.stringify({
          ...(opts.onlyRepo ? { repositories: [opts.onlyRepo] } : {}),
          ...(opts.readOnly ? { permissions: { contents: "read", metadata: "read" } } : {}),
        })
      : undefined;
  const res = await fetch(`${API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      ...H,
      Authorization: `Bearer ${appJwt()}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body } : {}),
  });
  if (!res.ok) {
    const e: any = new Error(
      `GitHub no dio token para la instalación ${installationId} (${res.status}). ¿Se desinstaló la App o se quitó el repo?`
    );
    e.code = "GithubInstallationToken";
    e.status = 502;
    throw e;
  }
  const j = (await res.json()) as { token: string; expires_at?: string };
  cache.set(key, { token: j.token, exp: Date.parse(j.expires_at ?? "") || now + 3_600_000 });
  return j.token;
}

/** Liga para instalar la App o cambiar sus repos. `/installations/new` es la única que propaga `state`. */
export function installUrl(state: string): string {
  return `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new?state=${encodeURIComponent(state)}`;
}

/**
 * Autorizar sin instalar. Si la App ya está instalada en su cuenta (p. ej. desde
 * Teams), `/installations/new` abre la pantalla de configuración y NO regresa;
 * esta liga sí regresa al instante con `code` (mismo callback, el relay de Teams).
 */
export function authorizeUrl(state: string): string {
  const q = new URLSearchParams({ client_id: process.env.GITHUB_CLIENT_ID ?? "", state });
  return `https://github.com/login/oauth/authorize?${q}`;
}

/** Canjea el `code` user-to-server. Sólo se usa para saber qué instalaciones son del usuario; no se guarda. */
export async function exchangeUserCode(code: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    // Sin Accept: application/json GitHub contesta form-encoded.
    headers: { Accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!j.access_token) throw new Error(`GitHub no aceptó el código (${j.error ?? res.status})`);
  return j.access_token;
}

export type UserInstallation = { id: number; account: string; accountType: string };

/** Instalaciones de la App que el USUARIO puede ver (su cuenta y sus organizaciones). */
export async function userInstallations(userToken: string): Promise<UserInstallation[]> {
  const res = await fetch(`${API}/user/installations?per_page=100`, {
    headers: { ...H, Authorization: `Bearer ${userToken}` },
  });
  if (!res.ok) throw new Error(`GitHub /user/installations: ${res.status}`);
  const j = (await res.json()) as { installations?: any[] };
  return (j.installations ?? []).map((i) => ({
    id: Number(i.id),
    account: String(i.account?.login ?? ""),
    accountType: String(i.account?.type ?? "User"),
  }));
}

export type InstallationRepo = {
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  private: boolean;
  pushedAt: string | null;
};

/** Repos a los que llega una instalación (los que el usuario eligió al instalar). */
export async function installationRepos(installationId: number): Promise<InstallationRepo[]> {
  const token = await installationToken(installationId, { readOnly: true });
  const out: InstallationRepo[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`${API}/installation/repositories?per_page=100&page=${page}`, {
      headers: { ...H, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) break;
    const j = (await res.json()) as { repositories?: any[] };
    const repos = j.repositories ?? [];
    for (const r of repos) {
      out.push({
        fullName: r.full_name,
        cloneUrl: r.clone_url,
        defaultBranch: r.default_branch ?? "main",
        private: !!r.private,
        pushedAt: r.pushed_at ?? null,
      });
    }
    if (repos.length < 100) break;
  }
  return out;
}

/** "dueño/repo" desde cualquier URL de GitHub (https, .git, ssh). null si no es de GitHub. */
export function repoPathFromUrl(url: string): string | null {
  const m = url.trim().match(/github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
}

/** Firma del webhook de la App (`x-hub-signature-256`). */
export function verifyAppWebhook(rawBody: string, header: string | null): boolean {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
