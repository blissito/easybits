/**
 * Push-deploy: cada `git push` a la rama de la máquina la redespliega sola.
 *
 * Antes la única forma era armar un workflow de GitHub Actions a mano (dos
 * secretos, build, empaquetado, subida, launch) — y los estudiantes del trial
 * no lo lograban configurar. Aquí basta pegar UN webhook en GitHub.
 *
 * Piezas:
 *  - la máquina recuerda su fuente (`runspec.source`, lo escribe launchApp);
 *  - el secreto del webhook vive en el vault del dueño (`DEPLOY_HOOK_<id>`) —
 *    si no existe, el push-deploy está apagado; no hay otro interruptor;
 *  - el receptor verifica la firma de GitHub, contesta 202 al instante (GitHub
 *    corta a los 10 s) y lanza el deploy en segundo plano;
 *  - launchApp ya vuelve solo al release anterior si el build falla, así que
 *    un push roto NO tumba el sitio. Aquí sólo se avisa por correo.
 *
 * El lock es en memoria (la superficie es una sola máquina de Fly): dos pushes
 * seguidos corren dos deploys, no N — los intermedios se colapsan en uno.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { config } from "../config";
import { db } from "../db";
import { sendTransactional } from "../emails/sendTransactional";
import { ownerContext } from "./hostingMonitorOperations";
import { launchApp, runspecSchema, type Runspec } from "./releaseOperations";
import { createSecret, deleteSecretByName, getSecretValue } from "./secretOperations";
import { effectiveOwnerId } from "./sandboxOperations";

export function hookSecretName(sandboxId: string): string {
  return `DEPLOY_HOOK_${sandboxId.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toUpperCase()}`;
}

export function hookUrl(sandboxId: string): string {
  return `${config.baseUrl}/api/v2/machines/${sandboxId}/github-hook`;
}

/** `x-hub-signature-256` = "sha256=" + HMAC-SHA256(body crudo, secreto). */
export function verifyGithubSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function ownedMachine(ctx: AuthContext, sandboxId: string) {
  const owner = await effectiveOwnerId(ctx, sandboxId);
  const row = await db.sandbox.findUnique({ where: { sandboxId } });
  if (!row || row.ownerId !== owner) {
    throw new Response(
      JSON.stringify({ error: "MachineNotFound", message: `Machine ${sandboxId} not found` }),
      { status: 404, headers: { "content-type": "application/json" } }
    );
  }
  return { row, owner };
}

export async function enablePushDeploy(ctx: AuthContext, sandboxId: string) {
  requireScope(ctx, "WRITE");
  const { row, owner } = await ownedMachine(ctx, sandboxId);
  const spec = runspecSchema.safeParse(row.runspec ?? {});
  const source = spec.success ? spec.data.source : undefined;
  if (!source) {
    const e: any = new Error(
      "This machine does not know which repo it comes from. Deploy it once from the repo — launch_app({ sandboxId, repo, branch, repoToken }) — and then enable push-deploy."
    );
    e.code = "MachineHasNoRepo";
    e.status = 409;
    throw e;
  }
  // Rotar = volver a llamar: el secreto nuevo reemplaza al viejo en el vault.
  const secret = randomBytes(24).toString("hex");
  await createSecret(owner, { name: hookSecretName(sandboxId), value: secret });
  const url = hookUrl(sandboxId);
  return {
    enabled: true,
    repo: source.repo,
    branch: source.branch ?? "(default branch)",
    webhook: { url, secret, contentType: "application/json", events: ["push"] },
    steps: [
      `GitHub → your repo → Settings → Webhooks → Add webhook`,
      `Payload URL: ${url}`,
      `Content type: application/json`,
      `Secret: the "secret" above (shown only now; call this again to rotate it)`,
      `Events: "Just the push event" → Add webhook`,
    ],
  };
}

export async function disablePushDeploy(ctx: AuthContext, sandboxId: string) {
  requireScope(ctx, "WRITE");
  const { owner } = await ownedMachine(ctx, sandboxId);
  await deleteSecretByName(owner, hookSecretName(sandboxId));
  return { enabled: false };
}

export async function getPushDeployStatus(ctx: AuthContext, sandboxId: string) {
  const { row, owner } = await ownedMachine(ctx, sandboxId);
  const spec = runspecSchema.safeParse(row.runspec ?? {});
  const on = !!(await db.secret.findUnique({
    where: { userId_name: { userId: owner, name: hookSecretName(sandboxId) } },
    select: { id: true },
  }));
  return {
    enabled: on,
    url: hookUrl(sandboxId),
    source: spec.success ? spec.data.source ?? null : null,
    running: running.has(sandboxId),
  };
}

// ── receptor ────────────────────────────────────────────────────────────────

type Commit = { sha: string; title: string; pusher?: string };
const running = new Map<string, { pending: Commit | null }>();

export async function handleGithubHook(
  sandboxId: string,
  rawBody: string,
  headers: Headers
): Promise<{ status: number; body: Record<string, unknown> }> {
  const row = await db.sandbox.findUnique({
    where: { sandboxId },
    select: { ownerId: true, runspec: true, status: true },
  });
  // Mismo 404 para "no existe" y "está apagado": no se revela qué máquinas hay.
  const secret = row ? await getSecretValue(row.ownerId, hookSecretName(sandboxId)) : null;
  if (!row || !secret) return { status: 404, body: { error: "PushDeployNotEnabled" } };
  if (!verifyGithubSignature(rawBody, headers.get("x-hub-signature-256"), secret)) {
    return { status: 403, body: { error: "BadSignature" } };
  }

  const event = headers.get("x-github-event");
  if (event === "ping") return { status: 200, body: { ok: true, pong: true } };
  if (event !== "push") return { status: 200, body: { ignored: `event ${event}` } };

  let payload: any;
  try {
    // Si eligieron "application/x-www-form-urlencoded" en GitHub, el JSON
    // viaja en el campo `payload`. La firma es sobre el body crudo igual.
    const form = headers.get("content-type")?.includes("x-www-form-urlencoded");
    payload = JSON.parse(form ? new URLSearchParams(rawBody).get("payload") ?? "" : rawBody);
  } catch {
    return { status: 400, body: { error: "BadPayload" } };
  }
  const spec = runspecSchema.safeParse(row.runspec ?? {});
  const source = spec.success ? spec.data.source : undefined;
  if (!source) return { status: 409, body: { error: "MachineHasNoRepo" } };

  const branch = source.branch ?? payload.repository?.default_branch;
  if (payload.deleted || payload.ref !== `refs/heads/${branch}`) {
    return { status: 200, body: { ignored: `ref ${payload.ref} (deploys ${branch})` } };
  }
  // Sólo se descartan estados muertos: la fila puede quedarse en
  // "provisioning" un rato después de que la caja ya sirve, y launchApp espera
  // a que esté arriba de todos modos.
  if (["suspended", "pending_deletion", "destroyed", "lost"].includes(row.status)) {
    return { status: 409, body: { error: "MachineNotRunning", status: row.status } };
  }

  const commit: Commit = {
    sha: String(payload.after ?? payload.head_commit?.id ?? ""),
    title: String(payload.head_commit?.message ?? "").split("\n")[0].slice(0, 120),
    pusher: payload.pusher?.name,
  };
  const queued = schedule(sandboxId, row.ownerId, spec.data as Runspec, commit);
  return { status: 202, body: { accepted: true, queued, commit: commit.sha.slice(0, 7) } };
}

/** true = quedó en cola detrás de un deploy en curso. */
function schedule(sandboxId: string, ownerId: string, spec: Runspec, commit: Commit): boolean {
  const slot = running.get(sandboxId);
  if (slot) {
    slot.pending = commit; // el último push gana; los intermedios se descartan
    return true;
  }
  running.set(sandboxId, { pending: null });
  void (async () => {
    let next: Commit | null = commit;
    while (next) {
      await runPushDeploy(sandboxId, ownerId, spec, next).catch((e) =>
        console.error(`[push-deploy] ${sandboxId}:`, e?.message ?? e)
      );
      next = running.get(sandboxId)?.pending ?? null;
      running.set(sandboxId, { pending: null });
    }
    running.delete(sandboxId);
  })();
  return false;
}

async function runPushDeploy(sandboxId: string, ownerId: string, spec: Runspec, commit: Commit) {
  const ctx = await ownerContext(ownerId);
  if (!ctx || !spec.source) return;
  const t0 = Date.now();
  const sha7 = commit.sha.slice(0, 7);
  try {
    // Se pasa el runspec actual: launchApp arma el suyo con defaults (appDir
    // "/app", puerto 3000) y los mezcla ENCIMA del guardado — sin esto una app
    // en /srv/app:4000 se redesplegaría en el lugar equivocado. `prebuilt:
    // false` porque viene código fuente: hay que construirlo.
    const res = await launchApp(ctx, {
      sandboxId,
      repo: spec.source.repo,
      branch: spec.source.branch,
      repoToken: spec.source.tokenRef ? `$secret:${spec.source.tokenRef}` : undefined,
      appDir: spec.appDir,
      buildCommand: spec.buildCommand,
      startCommand: spec.startCommand,
      unit: spec.unit,
      port: spec.port,
      prebuilt: false,
      message: `push ${sha7}: ${commit.title}`.trim(),
    });
    console.log(`[push-deploy] ${sandboxId} ${sha7} → v${res.version} en ${Math.round((Date.now() - t0) / 1000)}s`);
  } catch (e: any) {
    const secs = Math.round((Date.now() - t0) / 1000);
    console.error(`[push-deploy] ${sandboxId} ${sha7} FALLÓ en ${secs}s: ${String(e?.message ?? e).slice(0, 300)}`);
    await notifyFailure(ctx, sandboxId, commit, e).catch((err) =>
      console.error("[push-deploy] no se pudo avisar:", err?.message ?? err)
    );
  }
}

async function notifyFailure(ctx: AuthContext, sandboxId: string, commit: Commit, err: any) {
  const to = ctx.user.email;
  if (!to) return;
  const esc = (s: unknown) =>
    String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const back = err?.rolledBackTo
    ? `<p>✅ Tu sitio sigue en línea con la versión anterior (v${err.rolledBackTo.version}).</p>`
    : `<p>⚠️ No había una versión anterior a la cual volver. Revisa la máquina en <a href="${config.baseUrl}/dash/hosting">/dash/hosting</a>.</p>`;
  await sendTransactional({
    to,
    subject: `❌ Falló el deploy de ${commit.sha.slice(0, 7)} en tu máquina`,
    html:
      `<p>El push <b>${esc(commit.sha.slice(0, 7))}</b> ${esc(commit.title)} no se pudo desplegar en <code>${esc(sandboxId)}</code>.</p>` +
      back +
      `<p>Lo que respondió el build:</p><pre style="white-space:pre-wrap;font-size:12px">${esc(String(err?.message ?? err).slice(-1500))}</pre>` +
      `<p>Arregla y vuelve a hacer push: se despliega solo.</p>`,
  });
}
