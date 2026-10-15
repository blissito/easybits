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

/**
 * Canjea el `code` user-to-server. Se usa para saber qué instalaciones son del
 * usuario y, en «Conectar a GitHub» de un sitio, para crear su repo. Nunca se guarda.
 */
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

/** Login del dueño del token de usuario. */
export async function githubLogin(userToken: string): Promise<string> {
  const res = await fetch(`${API}/user`, { headers: { ...H, Authorization: `Bearer ${userToken}` } });
  if (!res.ok) throw new Error(`GitHub /user: ${res.status}`);
  return String(((await res.json()) as { login?: string }).login ?? "");
}

export type CreatedRepo = { id: number; fullName: string; name: string; cloneUrl: string; htmlUrl: string };

/**
 * Crea un repo VACÍO (privado salvo que el dueño elija público) en la cuenta del usuario (token user-to-server).
 * Requiere que la App tenga `Administration: write`; sin eso GitHub contesta 403.
 * Si el nombre ya existe prueba `nombre-2` … `nombre-9`.
 */
export async function createUserRepo(userToken: string, baseName: string, description?: string, isPrivate = true): Promise<CreatedRepo> {
  // Un intento anterior que murió después de crear el repo lo dejó VACÍO y con nuestra
  // descripción: se reusa en vez de sembrar `nombre-2`, `nombre-3`… con cada reintento.
  const login = await githubLogin(userToken).catch(() => "");
  if (login && description) {
    const r = await fetch(`${API}/repos/${login}/${baseName}`, { headers: { ...H, Authorization: `Bearer ${userToken}` } });
    if (r.ok) {
      const j = (await r.json()) as any;
      if (j.size === 0 && j.description === description)
        return { id: Number(j.id), fullName: j.full_name, name: j.name, cloneUrl: j.clone_url, htmlUrl: j.html_url };
    }
  }
  for (let i = 1; i <= 9; i++) {
    const name = i === 1 ? baseName : `${baseName}-${i}`;
    const res = await fetch(`${API}/user/repos`, {
      method: "POST",
      headers: { ...H, Authorization: `Bearer ${userToken}`, "content-type": "application/json" },
      body: JSON.stringify({ name, private: isPrivate, auto_init: false, description }),
    });
    if (res.ok) {
      const r = (await res.json()) as any;
      return { id: Number(r.id), fullName: r.full_name, name: r.name, cloneUrl: r.clone_url, htmlUrl: r.html_url };
    }
    const body = (await res.json().catch(() => ({}))) as { message?: string; errors?: { message?: string }[] };
    const taken = res.status === 422 && JSON.stringify(body).includes("already exists");
    if (taken) continue;
    const e: any = new Error(
      res.status === 403
        ? "GitHub no dejó crear el repo: la App necesita el permiso «Administration: write» (acepta los permisos nuevos en GitHub)."
        : `GitHub no creó el repo (${res.status}${body.message ? `: ${body.message}` : ""}).`
    );
    e.code = res.status === 403 ? "GithubRepoPermission" : "GithubRepoCreate";
    throw e;
  }
  throw new Error(`Ya existen repos llamados ${baseName} … ${baseName}-9 en tu cuenta.`);
}

/**
 * El repo nuevo tiene que estar en la instalación: sin eso el token de instalación no
 * puede empujar y el webhook no lo ve.
 *
 * Medido en prod (2026-10-14): un repo que la App crea con token de usuario ENTRA SOLO a
 * una instalación de "repos seleccionados", y el PUT de abajo contesta 403 con ese token
 * (GitHub sólo lo acepta con PAT clásico). Así que primero se comprueba; el PUT queda de
 * respaldo y su error sólo cuenta si el repo de verdad no está.
 */
export async function ensureRepoInInstallation(userToken: string, installationId: number, repoId: number, fullName: string): Promise<void> {
  const has = async () =>
    (await installationRepos(installationId).catch(() => [] as InstallationRepo[])).some(
      (r) => r.fullName.toLowerCase() === fullName.toLowerCase()
    );
  if (await has()) return;
  const res = await fetch(`${API}/user/installations/${installationId}/repositories/${repoId}`, {
    method: "PUT",
    headers: { ...H, Authorization: `Bearer ${userToken}` },
  });
  if (res.ok || res.status === 304 || (await has())) return;
  throw new Error(
    `El repo ${fullName} no quedó al alcance de la App (${res.status}). Agrégalo en GitHub → Settings → Applications → Ghosty Studio → Repository access, y vuelve a conectar.`
  );
}

/** "dueño/repo" desde cualquier URL de GitHub (https, .git, ssh). null si no es de GitHub. */
export function repoPathFromUrl(url: string): string | null {
  const m = url.trim().match(/github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
}

/**
 * Firma del webhook de la App (`x-hub-signature-256`).
 *
 * Desde el 2026-09-24 el receptor ÚNICO de la App es Ghosty Studio (`/api/github/app-hook`), que
 * nos reenvía verbatim lo nuestro (push, installation) firmado con su secreto de reenvío
 * (`GITHUB_APP_WEBHOOK_FORWARD_SECRET`). Se aceptan los dos: el de la App (llegada directa, y
 * rollback) y el de reenvío. Sobre el cuerpo CRUDO siempre.
 */
export function verifyAppWebhook(rawBody: string, header: string | null): boolean {
  if (!header) return false;
  const b = Buffer.from(header);
  for (const secret of [process.env.GITHUB_APP_WEBHOOK_SECRET, process.env.GITHUB_APP_WEBHOOK_FORWARD_SECRET]) {
    if (!secret) continue;
    const a = Buffer.from("sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex"));
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** Un archivo del repo (texto) con la instalación, o null si no existe. */
export async function readRepoFile(
  installationId: number,
  repoPath: string,
  path: string,
  ref?: string
): Promise<string | null> {
  const token = await installationToken(installationId, {
    onlyRepo: repoPath.split("/")[1],
    readOnly: true,
  });
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const res = await fetch(`${API}/repos/${repoPath}/contents/${path}${q}`, {
    headers: { ...H, Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw+json" },
  });
  return res.ok ? res.text() : null;
}
