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
  readRepoFile,
  repoPathFromUrl,
  userInstallations,
  verifyAppWebhook,
  type InstallationRepo,
} from "./githubApp";
import { acceptPush } from "./pushDeployOperations";
import { launchApp, runspecSchema, type LaunchStep } from "./releaseOperations";

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

// Servidor estático para lo que no trae `start`. `npx` y no global: un release
// se reconstruye en una caja limpia y ahí sólo existe lo que el comando baje.
const STATIC_SERVE = (dir: string) => `npx --yes serve@14 -l tcp://0.0.0.0:3000 ${dir}`;
const INSTALL = "(npm ci || npm install)";

/**
 * Cómo construir y arrancar, leyendo el repo (lo que Vercel llama detectar el
 * framework). launchApp por default supone `npm run build` + `npm start`, y un
 * sitio estático —index.html y un package.json sin scripts— moría en el build.
 */
export async function detectRunspec(
  installationId: number,
  repoPath: string,
  branch?: string
): Promise<{ buildCommand: string; startCommand: string }> {
  const raw = await readRepoFile(installationId, repoPath, "package.json", branch).catch(() => null);
  let scripts: Record<string, string> = {};
  if (raw) {
    try {
      scripts = JSON.parse(raw).scripts ?? {};
    } catch {
      /* package.json roto: se trata como estático */
    }
  }
  const warm = `npx --yes serve@14 --version >/dev/null`;
  if (!raw) return { buildCommand: warm, startCommand: STATIC_SERVE(".") };
  if (scripts.start) {
    return {
      buildCommand: scripts.build ? `${INSTALL} && npm run build` : INSTALL,
      startCommand: "npm start",
    };
  }
  if (scripts.build) {
    // Build sin start = sitio estático generado (Vite, Astro, CRA…). La salida
    // más común primero; si no hay ninguna, la raíz.
    const out = `$(for d in dist build out public; do [ -f "$d/index.html" ] && echo "$d" && break; done; true)`;
    return {
      buildCommand: `${INSTALL} && npm run build && ${warm}`,
      startCommand: `sh -c 'd=${out}; exec ${STATIC_SERVE('"${d:-.}"')}'`,
    };
  }
  return { buildCommand: `${INSTALL} && ${warm}`, startCommand: STATIC_SERVE(".") };
}

export async function importRepo(
  ctx: AuthContext,
  params: {
    repo: string;
    branch?: string;
    sandboxId?: string;
    tier?: string;
    onStep?: (step: LaunchStep, info?: { sandboxId?: string }) => void;
  }
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
  const branch = params.branch || hit.defaultBranch;
  const detected = await detectRunspec(hit.installationId, hit.fullName, branch);
  return launchApp(ctx, {
    repo: hit.cloneUrl,
    branch,
    ...detected,
    githubInstallationId: hit.installationId,
    sandboxId: params.sandboxId || undefined,
    tier: params.tier,
    name: hit.fullName.split("/")[1],
    message: `import ${hit.fullName}`,
    onStep: params.onStep,
  });
}

// ── deploy en segundo plano + estado para el stepper ─────────────────────────

const TERMINAL = new Set(["ready", "failed", "checkout"]);
/** Sin avance en este tiempo = el proceso murió (p. ej. un deploy de EasyBits lo reinició). */
const STALE_MS = 30 * 60_000;

/**
 * Arranca el import y regresa AL INSTANTE con el id del Deployment. La UI
 * pregunta por él cada par de segundos; antes la petición se quedaba abierta
 * todo el build y el botón decía «Desplegando…» sin más.
 */
export async function startImport(
  ctx: AuthContext,
  params: { repo: string; branch?: string; sandboxId?: string; tier?: string }
) {
  requireScope(ctx, "WRITE");
  const dep = await db.deployment.create({
    data: {
      ownerId: ctx.user.id,
      repo: params.repo,
      branch: params.branch || null,
      sandboxId: params.sandboxId || null,
      trigger: "import",
    },
  });
  const set = (data: Record<string, unknown>) =>
    db.deployment.update({ where: { id: dep.id }, data }).catch(() => {});

  void (async () => {
    try {
      const res = await importRepo(ctx, {
        ...params,
        onStep: (step, info) =>
          void set({ status: step, ...(info?.sandboxId ? { sandboxId: info.sandboxId } : {}) }),
      });
      if (res.checkoutUrl) {
        await set({ status: "checkout", checkoutUrl: res.checkoutUrl });
      } else {
        await set({ status: "ready", url: res.url, version: res.version, sandboxId: res.sandboxId });
      }
    } catch (e: any) {
      await set({ status: "failed", error: String(e?.message ?? e).slice(-2000) });
    }
  })();
  return { deploymentId: dep.id };
}

export async function getDeployment(userId: string, id: string) {
  const dep = await db.deployment.findFirst({ where: { id, ownerId: userId } });
  if (!dep) return null;
  if (!TERMINAL.has(dep.status) && Date.now() - dep.updatedAt.getTime() > STALE_MS) {
    return db.deployment.update({
      where: { id },
      data: { status: "failed", error: "El deploy se interrumpió. Vuelve a intentarlo." },
    });
  }
  return dep;
}

/** Deploys recientes del usuario (para retomar el stepper tras recargar). */
export function recentDeployments(userId: string, limit = 5) {
  return db.deployment.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
    take: limit,
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
