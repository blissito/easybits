/**
 * «Conecta tu repo y ya está»: importar un repo de GitHub a una máquina de
 * hosting y redesplegarla sola en cada push, con la GitHub App.
 *
 * Tres piezas:
 *  - `claimInstallations`: tras instalar la App, el `code` user-to-server dice
 *    qué instalaciones VE ese usuario; se guardan y el token se tira.
 *  - `importRepo`: launchApp con `githubInstallationId` (sin PAT).
 *  - `handleAppWebhook`: el webhook ÚNICO de la App. Un push busca las máquinas
 *    que salieron de ese repo por esa instalación y reusa `acceptPush` (cola,
 *    colapso de pushes, correo y rollback de push-deploy).
 */
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { db } from "../db";
import {
  exchangeUserCode,
  installationRepos,
  repoPathFromUrl,
  userInstallations,
  verifyAppWebhook,
  type InstallationRepo,
} from "./githubApp";
import { acceptPush } from "./pushDeployOperations";
import { launchApp, runspecSchema } from "./releaseOperations";

export async function claimInstallations(userId: string, code: string) {
  const userToken = await exchangeUserCode(code);
  const installs = await userInstallations(userToken);
  for (const i of installs) {
    await db.githubInstallation.upsert({
      where: { userId_installationId: { userId, installationId: i.id } },
      create: { userId, installationId: i.id, account: i.account, accountType: i.accountType },
      update: { account: i.account, accountType: i.accountType },
    });
  }
  return installs.length;
}

export type ImportableRepo = InstallationRepo & { installationId: number; account: string };

/** Repos importables del usuario. Una instalación que ya no responde se olvida. */
export async function listImportableRepos(userId: string): Promise<ImportableRepo[]> {
  const rows = await db.githubInstallation.findMany({ where: { userId } });
  const lists = await Promise.all(
    rows.map(async (r) => {
      try {
        const repos = await installationRepos(r.installationId);
        return repos.map((x) => ({ ...x, installationId: r.installationId, account: r.account }));
      } catch {
        return [];
      }
    })
  );
  return lists
    .flat()
    .sort((a, b) => String(b.pushedAt ?? "").localeCompare(String(a.pushedAt ?? "")));
}

export async function importRepo(
  ctx: AuthContext,
  params: { repo: string; branch?: string; sandboxId?: string; tier?: string }
) {
  requireScope(ctx, "WRITE");
  // El repo se busca entre LOS SUYOS: un installationId que llegara del
  // formulario dejaría clonar repos de instalaciones ajenas.
  const repos = await listImportableRepos(ctx.user.id);
  const hit = repos.find((r) => r.fullName.toLowerCase() === params.repo.toLowerCase());
  if (!hit) {
    const e: any = new Error(
      `${params.repo} no está entre los repos que diste a la App. Agrégalo en GitHub y vuelve a intentar.`
    );
    e.code = "RepoNotInstalled";
    e.status = 404;
    throw e;
  }
  return launchApp(ctx, {
    repo: hit.cloneUrl,
    branch: params.branch || hit.defaultBranch,
    githubInstallationId: hit.installationId,
    sandboxId: params.sandboxId || undefined,
    tier: params.tier,
    name: hit.fullName.split("/")[1],
    message: `import ${hit.fullName}`,
  });
}

export async function handleAppWebhook(
  rawBody: string,
  headers: Headers
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!verifyAppWebhook(rawBody, headers.get("x-hub-signature-256"))) {
    return { status: 403, body: { error: "BadSignature" } };
  }
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "BadPayload" } };
  }
  const event = headers.get("x-github-event");
  const installationId = Number(payload?.installation?.id);

  if (event === "ping") return { status: 200, body: { ok: true, pong: true } };
  if (event === "installation" && payload.action === "deleted" && installationId) {
    const { count } = await db.githubInstallation.deleteMany({ where: { installationId } });
    return { status: 200, body: { forgotten: count } };
  }
  if (event !== "push" || !installationId) {
    return { status: 200, body: { ignored: `event ${event}` } };
  }

  const repoPath = repoPathFromUrl(String(payload.repository?.clone_url ?? ""));
  if (!repoPath) return { status: 200, body: { ignored: "repo" } };

  // runspec es Json: Prisma-Mongo no filtra por rutas dentro de él, así que se
  // filtra aquí. Son sólo las máquinas permanentes vivas.
  const rows = await db.sandbox.findMany({
    where: { persistent: true, status: { notIn: ["destroyed", "pending_deletion"] } },
    select: { sandboxId: true, ownerId: true, runspec: true, status: true },
  });
  const targets = rows.filter((r) => {
    const spec = runspecSchema.safeParse(r.runspec ?? {});
    const src = spec.success ? spec.data.source : undefined;
    return src?.installationId === installationId && repoPathFromUrl(src.repo) === repoPath;
  });

  const results = targets.map((r) => ({ sandboxId: r.sandboxId, ...acceptPush(r.sandboxId, r, payload).body }));
  return { status: 202, body: { repo: repoPath, machines: results } };
}
