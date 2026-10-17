// Caducidad de las cajas de trabajo (web apps de /dash/sitios sin publicar). Las paga
// EasyBits y, sin esto, vivían para siempre dormidas con candado, ocupando disco, snapshot
// y el cupo del plan (con el hero de la home cada «Construir» abandonado dejaba una).
//
// Regla: WORK_BOX_WARN_DAYS sin turnos → correo de aviso (una vez); WORK_BOX_IDLE_DAYS →
// /app (sin dependencias ni builds) a Tigris, la caja se destruye y el sitio queda
// `archivedAt`. Abrirlo y mandar un mensaje la revive (reviveSite, siteOperations.ts).
// Nunca toca una caja publicada (workBox false) ni una con turno en curso, y si el archivo
// no quedó verificado la caja NO se destruye.
import { db } from "~/.server/db";
import type { AuthContext } from "~/.server/apiAuth";
import { WORK_BOX_IDLE_DAYS, WORK_BOX_WARN_DAYS } from "~/lib/hostingCatalog";
import { backupMachine } from "./machineBackupOperations";
import { releasePermanent } from "./machineOperations";
import { NOT_DELETED, siteGroupId } from "./siteOperations";
import { sendTransactional } from "~/.server/emails/sendTransactional";

const DAY = 86_400_000;
/** Lo que se reconstruye solo al revivir: la caja dorada trae node_modules y el build se rehace. */
export const ARCHIVE_EXCLUDE = ["node_modules", "dist", "build", ".output", ".react-router", ".tanstack", ".nuxt", ".svelte-kit", ".next", ".astro", "local.db*"];
const ARCHIVE_RETENTION_DAYS = 180;

export type ExpiryDecision = "keep" | "warn" | "archive";

/** Decisión pura (la prueban los tests): días desde la última actividad y si ya se avisó DESPUÉS de ella. */
export function expiryDecision(p: { now: Date; lastActivity: Date; warnedAt: Date | null; turnRunning: boolean }): ExpiryDecision {
  if (p.turnRunning) return "keep";
  const idle = (p.now.getTime() - p.lastActivity.getTime()) / DAY;
  if (idle >= WORK_BOX_IDLE_DAYS) return "archive";
  // Un aviso anterior a la última actividad ya no cuenta: volvió y se le avisa de nuevo si se va otra vez.
  const warned = !!p.warnedAt && p.warnedAt.getTime() > p.lastActivity.getTime();
  if (idle >= WORK_BOX_WARN_DAYS && !warned) return "warn";
  return "keep";
}

export async function expireIdleWorkBoxes(now = new Date()) {
  const sites = await db.site.findMany({
    where: {
      kind: "webapp",
      sandboxId: { not: null },
      ...NOT_DELETED,
      AND: [{ OR: [{ archivedAt: null }, { archivedAt: { isSet: false } }] }],
    },
    select: { id: true, name: true, ownerId: true, sandboxId: true, createdAt: true, expiryWarnedAt: true },
  });
  const out = { checked: 0, warned: [] as string[], archived: [] as string[], failed: [] as { siteId: string; error: string }[] };
  for (const site of sites) {
    const box = await db.sandbox.findUnique({ where: { sandboxId: site.sandboxId! }, select: { workBox: true, status: true } });
    if (!box?.workBox || ["destroyed", "pending_deletion"].includes(box.status)) continue;
    out.checked++;
    const last = await db.fleetTurn.findFirst({
      where: { groupId: siteGroupId(site.id) },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, state: true },
    });
    const decision = expiryDecision({
      now,
      lastActivity: last?.startedAt && last.startedAt > site.createdAt ? last.startedAt : site.createdAt,
      warnedAt: site.expiryWarnedAt ?? null,
      turnRunning: last?.state === "running",
    });
    try {
      if (decision === "warn") {
        await warnOwner(site);
        await db.site.update({ where: { id: site.id }, data: { expiryWarnedAt: now } });
        out.warned.push(site.id);
      } else if (decision === "archive") {
        await archiveSite(site);
        out.archived.push(site.id);
      }
    } catch (e) {
      out.failed.push({ siteId: site.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

/** /app a Tigris (verificado) → destruir la caja → sitio archivado. Sin archivo no se destruye nada. */
export async function archiveSite(site: { id: string; ownerId: string; sandboxId: string | null }) {
  if (!site.sandboxId) throw new Error("sin caja");
  const backup = await backupMachine(site.sandboxId, {
    force: true,
    paths: ["/app"],
    exclude: ARCHIVE_EXCLUDE,
    scope: "site-archive",
    retentionDays: ARCHIVE_RETENTION_DAYS,
  });
  if (backup.status !== "available") throw new Error(`archivo ${backup.id} quedó ${backup.status}`);
  const user = await db.user.findUnique({ where: { id: site.ownerId } });
  if (!user) throw new Error("dueño no encontrado");
  const ctx = { user, scopes: ["READ", "WRITE", "DELETE"] } as AuthContext;
  await releasePermanent(ctx, site.sandboxId, { backupId: backup.id });
  await db.site.update({ where: { id: site.id }, data: { archivedAt: new Date(), archiveBackupId: backup.id } });
  return backup;
}

async function warnOwner(site: { id: string; name: string; ownerId: string }) {
  const user = await db.user.findUnique({ where: { id: site.ownerId }, select: { email: true, displayName: true } });
  if (!user?.email) return;
  const url = `https://www.easybits.cloud/dash/sitios/${site.id}`;
  const days = WORK_BOX_IDLE_DAYS - WORK_BOX_WARN_DAYS;
  await sendTransactional({
    to: user.email,
    subject: `Tu app «${site.name}» se archiva en ${days} días`,
    html: `<p>Hola${user.displayName ? ` ${user.displayName}` : ""}:</p>
<p>Tu app <b>${escapeHtml(site.name)}</b> lleva ${WORK_BOX_WARN_DAYS} días sin cambios y todavía no está publicada. En ${days} días la archivamos para liberar su máquina: el código se guarda y no se pierde nada.</p>
<p>Si quieres seguir con ella, ábrela y mándale un mensaje al agente. Si ya la archivamos, al abrirla vuelve en unos segundos.</p>
<p><a href="${url}">Abrir ${escapeHtml(site.name)}</a></p>
<p>— EasyBits</p>`,
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
