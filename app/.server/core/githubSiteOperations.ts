/**
 * «Conectar a GitHub» de un sitio webapp (patrón Lovable): el sitio nace SIN
 * repo; al conectar se crea un repo privado nuevo en la cuenta del usuario, se
 * sube /app y se engancha el push-deploy que ya existe. Desde ahí:
 *  - «Publicar» = commit + push + release en el acto (el webhook de ese commit se ignora).
 *  - Un push desde fuera (el usuario en su compu) re-clona /app y despliega solo.
 *
 * El token de usuario sólo vive durante el callback: crea el repo y se tira.
 * Empujar usa el token de INSTALACIÓN, recortado al repo.
 */
import type { AuthContext } from "../apiAuth";
import { db } from "../db";
import {
  createUserRepo,
  ensureRepoInInstallation,
  githubLogin,
  installationToken,
  repoPathFromUrl,
} from "./githubApp";
import { claimInstallationsWithToken } from "./githubImportOperations";
import { gitCommit, gitPush, runGit } from "./gitOperations";
import { runspecSchema, setRunspec } from "./releaseOperations";
import { getSite } from "./siteOperations";

const APP_DIR = "/app";
// Lo que nunca debe subir: dependencias, builds y cualquier secreto local.
const GITIGNORE = ["node_modules/", ".env", ".env.*", "easybits.json", "dist/", "build/", ".DS_Store"].join("\n") + "\n";

/** El repo al que está conectado un sitio, o null. */
export function siteRepo(runspec: unknown): { repo: string; fullName: string | null; installationId: number } | null {
  const spec = runspecSchema.safeParse(runspec ?? {});
  const src = spec.success ? spec.data.source : undefined;
  if (!src?.installationId) return null;
  return { repo: src.repo, fullName: repoPathFromUrl(src.repo), installationId: src.installationId };
}

function repoNameFor(siteName: string): string {
  const slug = siteName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "mi-app";
}

export type ConnectResult =
  | { ok: true; fullName: string; htmlUrl: string }
  | { ok: false; needsInstall: true };

/**
 * Crea el repo y sube el código. `needsInstall` = la App no está instalada en la
 * cuenta personal del usuario: hay que mandarlo a instalarla y volver a llamar.
 */
export async function connectSiteToGithub(
  ctx: AuthContext,
  siteId: string,
  userToken: string
): Promise<ConnectResult> {
  const site = await getSite(ctx, siteId);
  if (site.kind !== "webapp" || !site.sandboxId) throw new Error("Sólo una web app con máquina se conecta a GitHub.");
  const existing = siteRepo(site.sandbox?.runspec);
  if (existing?.fullName) {
    return { ok: true, fullName: existing.fullName, htmlUrl: `https://github.com/${existing.fullName}` };
  }

  const [login, installs] = await Promise.all([githubLogin(userToken), claimInstallationsWithToken(ctx.user.id, userToken)]);
  const inst = installs.find((i) => i.account.toLowerCase() === login.toLowerCase());
  if (!inst) return { ok: false, needsInstall: true };

  const repo = await createUserRepo(userToken, repoNameFor(site.name), `${site.name} — creado con EasyBits`);
  await ensureRepoInInstallation(userToken, inst.id, repo.id, repo.fullName);

  // Un /app clonado con --depth 1 no se puede empujar a un repo vacío ("shallow
  // update not allowed"): en ese caso, y si no hay repo, se empieza historia nueva.
  await runGit(ctx, site.sandboxId, {
    dir: APP_DIR,
    args: "status --short >/dev/null",
    pre: [
      `mkdir -p ${APP_DIR}`,
      `if [ ! -d ${APP_DIR}/.git ] || [ "$(git -C ${APP_DIR} rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]; then rm -rf ${APP_DIR}/.git && git -C ${APP_DIR} init -q -b main; fi`,
      `[ -f ${APP_DIR}/.gitignore ] || printf '%s' '${GITIGNORE}' > ${APP_DIR}/.gitignore`,
    ],
  });
  await gitCommit(ctx, site.sandboxId, { dir: APP_DIR, message: `${site.name}: primera versión desde EasyBits` });
  const token = await installationToken(inst.id, { onlyRepo: repo.name });
  await gitPush(ctx, site.sandboxId, { dir: APP_DIR, remote: repo.cloneUrl, branch: "HEAD:main", auth: { token } });

  await setRunspec(ctx, site.sandboxId, {
    source: { repo: repo.cloneUrl, branch: "main", installationId: inst.id, repoId: repo.id },
  });
  return { ok: true, fullName: repo.fullName, htmlUrl: repo.htmlUrl };
}

/**
 * «Publicar» de un sitio conectado: commit de lo que hizo el agente y push a
 * main. Devuelve el sha empujado (null si no había cambios ni commits).
 */
export async function pushSiteToGithub(
  ctx: AuthContext,
  sandboxId: string,
  source: { repo: string; installationId: number },
  message: string
): Promise<string | null> {
  const commit = await gitCommit(ctx, sandboxId, { dir: APP_DIR, message });
  const name = repoPathFromUrl(source.repo)?.split("/")[1];
  const token = await installationToken(source.installationId, { onlyRepo: name });
  await gitPush(ctx, sandboxId, { dir: APP_DIR, remote: source.repo, branch: "HEAD:main", auth: { token } });
  if (commit.sha) return commit.sha;
  const head = await runGit(ctx, sandboxId, { dir: APP_DIR, args: "rev-parse HEAD" });
  return (head.stdout || "").trim() || null;
}

export async function siteOwnerHasGithub(userId: string): Promise<boolean> {
  return (await db.githubInstallation.count({ where: { userId } })) > 0;
}
