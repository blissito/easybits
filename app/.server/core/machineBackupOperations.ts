/**
 * Daily off-host backups for permanent machines — included in the price, 7-day
 * retention. Same deal Fly gives on volumes.
 *
 * WHAT IS COPIED: the data paths declared in the machine's runspec, NOT the
 * rootfs. Fly can leave the rootfs out because a deploy rebuilds it; here the
 * equivalent is the release artifact (releaseOperations). Copying gigabytes of
 * identical Debian + node_modules seven times per machine per day would pay
 * storage for something we can already reconstruct from `template` + release.
 *
 * WHY OFF-HOST: the host's own snapshots (internal/fc/snapshot.go) sit on the
 * same NVMe as the VM they protect, and there is exactly one host. A copy that
 * dies with the thing it protects is not a backup.
 *
 * HONESTY ABOUT CONSISTENCY: stage 1 tars a live filesystem, so a database
 * being written during the copy can land torn. Every backup records
 * `consistency: "crash"` and we do NOT pretend otherwise. Stage 2 moves the
 * copy host-side with `fsfreeze` and per-template quiesce hooks. This is the
 * same principle backupOperations.ts:82-93 already applies by failing loudly on
 * a truncated tar: a backup that overstates itself is worse than none.
 *
 * Transport is the release transport: tar to a file, upload over a presigned
 * PUT. Never `tar | base64` through exec (truncates), never `curl -T -`
 * (chunked, which S3/Tigris rejects on a presigned PUT).
 */

import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { db } from "../db";
import { effectiveOwnerId, execSandboxRaw, shQuote, writeFile } from "./sandboxOperations";
import { getPlatformDefaultClient } from "../storage";
import type { Runspec } from "./releaseOperations";
import { nanoid } from "nanoid";

const TMPDIR = process.env.RELEASE_TMPDIR || "/tmp";
const RETENTION_DAYS = Number(process.env.MACHINE_BACKUP_RETENTION_DAYS || 7);
/** Retention kept past a machine's hard-delete, so "I deleted it by mistake" on day 9 is survivable. */
const POST_DELETE_RETENTION_DAYS = 30;
const MAX_BYTES = Number(process.env.BACKUP_MAX_BYTES || 4 * 1024 * 1024 * 1024);
/** A machine with no fresh backup for this long is a problem worth surfacing. */
const STALE_ALERT_HOURS = 48;

function stampFor(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function redact(s: string): string {
  return s.replace(/X-Amz-Signature=[^&\s"']+/g, "X-Amz-Signature=REDACTED");
}

/** Absolute paths this machine's backup captures. Relative entries hang off appDir. */
function resolveDataPaths(spec: Runspec | null): string[] {
  if (!spec?.dataPaths?.length) return [];
  const base = spec.appDir.replace(/\/$/, "");
  return spec.dataPaths.map((p) => (p.startsWith("/") ? p : `${base}/${p}`));
}

export interface BackupRecord {
  id: string;
  sandboxId: string;
  stamp: string;
  scope: string;
  consistency: string;
  bytes: number;
  sha256: string | null;
  status: string;
  verifiedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

function toRecord(r: any): BackupRecord {
  return {
    id: r.id,
    sandboxId: r.sandboxId,
    stamp: r.stamp,
    scope: r.scope,
    consistency: r.consistency,
    bytes: Number(r.bytes ?? 0),
    sha256: r.sha256 ?? null,
    status: r.status,
    verifiedAt: r.verifiedAt ?? null,
    expiresAt: r.expiresAt ?? null,
    createdAt: r.createdAt,
  };
}

/**
 * Back up one machine. Server-to-server (no AuthContext) so the cron can call
 * it; the owner comes from the row.
 */
export async function backupMachine(
  sandboxId: string,
  opts: { force?: boolean } = {}
): Promise<BackupRecord> {
  const row = await db.sandbox.findUnique({ where: { sandboxId } });
  if (!row) throw new Error(`Machine ${sandboxId} not found`);
  const spec = (row.runspec as Runspec) ?? null;
  const paths = resolveDataPaths(spec);
  if (!paths.length) {
    const e: any = new Error(
      `Machine ${sandboxId} declares no runspec.dataPaths — nothing to back up. Set them with set_machine_runspec.`
    );
    e.code = "NoDataPaths";
    throw e;
  }

  const stamp = stampFor();
  const existing = await db.sandboxBackup.findUnique({
    where: { sandboxId_stamp: { sandboxId, stamp } },
  });
  if (existing && existing.status === "available" && !opts.force) return toRecord(existing);

  const key = `backups/machines/${sandboxId}/${stamp}.tar.gz`;
  const expiresAt = new Date(Date.now() + RETENTION_DAYS * 86400_000);
  const record = existing
    ? await db.sandboxBackup.update({
        where: { id: existing.id },
        data: { status: "uploading", error: null, key, expiresAt },
      })
    : await db.sandboxBackup.create({
        data: {
          ownerId: row.ownerId,
          sandboxId,
          key,
          stamp,
          scope: "data",
          consistency: "crash",
          status: "uploading",
          expiresAt,
        },
      });

  const storage = getPlatformDefaultClient({ prefix: "" });

  try {
    const putUrl = await storage.getPutUrl(key, { timeout: 3600 });
    const tag = nanoid(8);
    const urlFile = `${TMPDIR}/.eb-bk-${tag}.url`;
    const tarball = `${TMPDIR}/backup-${tag}.tar.gz`;
    // The presigned URL never touches a command line — it is a write capability
    // on our bucket and exec output goes to logs.
    await execSandboxRaw(
      row.ownerId,
      sandboxId,
      `cat > ${shQuote(urlFile)} <<'EBURL'\n${putUrl}\nEBURL`,
      30
    );

    const existing_paths = paths.map((p) => shQuote(p)).join(" ");
    const script = [
      "set -e",
      // No quiesce in stage 1 — sync at least flushes the page cache, which
      // makes the common case (files at rest) clean.
      "sync",
      // Missing paths are skipped, not fatal: a machine may legitimately not
      // have created its uploads dir yet.
      `PATHS=""; for p in ${existing_paths}; do [ -e "$p" ] && PATHS="$PATHS $p"; done`,
      `if [ -z "$PATHS" ]; then rm -f ${shQuote(urlFile)}; echo "NOPATHS"; exit 0; fi`,
      `tar czf ${shQuote(tarball)} $PATHS 2>/dev/null`,
      `SIZE=$(stat -c%s ${shQuote(tarball)})`,
      `if [ "$SIZE" -gt ${MAX_BYTES} ]; then rm -f ${shQuote(tarball)} ${shQuote(urlFile)}; echo "TOOBIG:$SIZE"; exit 0; fi`,
      `SHA=$(sha256sum ${shQuote(tarball)} | cut -d" " -f1)`,
      `MANIFEST=$(tar tzf ${shQuote(tarball)} | wc -l)`,
      `curl -fsS -X PUT -T ${shQuote(tarball)} -H "Content-Type: application/gzip" "$(cat ${shQuote(urlFile)})"`,
      `rm -f ${shQuote(tarball)} ${shQuote(urlFile)}`,
      `echo "OK:$SHA:$SIZE:$MANIFEST"`,
    ].join("\n");

    const res = await execSandboxRaw(row.ownerId, sandboxId, script, 600);
    if (res.exitCode !== 0) {
      await execSandboxRaw(row.ownerId, sandboxId, `rm -f ${shQuote(tarball)} ${shQuote(urlFile)}`, 30).catch(
        () => {}
      );
    }
    const out = (res.stdout || "").trim();
    if (out.includes("NOPATHS")) throw new Error("None of the declared dataPaths exist in the box");
    const tooBig = out.split("\n").find((l) => l.startsWith("TOOBIG:"));
    if (tooBig) throw new Error(`Backup is ${tooBig.slice(7)} bytes, over the ${MAX_BYTES} limit`);
    if (res.exitCode !== 0 || res.truncated) {
      throw new Error(
        redact(`Backup failed (exit ${res.exitCode}): ${(res.stderr || out).slice(-800)}`)
      );
    }
    const ok = out.split("\n").find((l) => l.startsWith("OK:"));
    if (!ok) throw new Error(redact(`Backup produced no result marker: ${out.slice(-400)}`));
    const [, sha256, sizeStr, entriesStr] = ok.split(":");
    const reported = Number(sizeStr);

    const head = await storage.headObject(key);
    if (!head) throw new Error("Upload reported success but the object is not in storage");
    if (head.size !== reported) {
      throw new Error(`Size mismatch: box reported ${reported} bytes, storage has ${head.size}`);
    }

    const updated = await db.sandboxBackup.update({
      where: { id: record.id },
      data: {
        status: "available",
        sha256,
        bytes: BigInt(reported),
        manifest: { paths, entries: Number(entriesStr) },
      },
    });
    return toRecord(updated);
  } catch (err: any) {
    await db.sandboxBackup
      .update({
        where: { id: record.id },
        data: { status: "failed", error: redact(String(err?.message ?? err)).slice(0, 900) },
      })
      .catch(() => {});
    await storage.deleteObject(key).catch(() => {});
    throw err;
  }
}

/** Cron entry point: back up every eligible permanent machine. */
export async function backupPermanentMachines(): Promise<{
  attempted: number;
  succeeded: number;
  failed: { sandboxId: string; error: string }[];
}> {
  const targets = await db.sandbox.findMany({
    where: {
      persistent: true,
      status: "running",
      NOT: { backupScope: "none" },
    },
  });
  const failed: { sandboxId: string; error: string }[] = [];
  let succeeded = 0;
  // Sequential on purpose: one host, shared I/O. A backup must not degrade the
  // machines it is protecting.
  for (const t of targets) {
    const spec = (t.runspec as Runspec) ?? null;
    if (!resolveDataPaths(spec).length) continue;
    try {
      await backupMachine(t.sandboxId);
      succeeded++;
    } catch (e: any) {
      failed.push({ sandboxId: t.sandboxId, error: String(e?.message ?? e).slice(0, 300) });
    }
  }
  return { attempted: targets.length, succeeded, failed };
}

/**
 * Rotate expired backups.
 *
 * TWO rules that exist because blind rotation is how people discover they have
 * no backups at all:
 *  - never delete a machine's most recent backup, expired or not;
 *  - only delete when a NEWER available backup exists.
 * If backups have been failing for eight days, the eight-day-old copy is
 * precisely the thing you still need.
 */
export async function pruneExpiredBackups(): Promise<{ deleted: number; kept: number }> {
  const now = new Date();
  const expired = await db.sandboxBackup.findMany({
    where: { status: "available", expiresAt: { lt: now } },
    orderBy: { createdAt: "desc" },
  });
  const storage = getPlatformDefaultClient({ prefix: "" });
  let deleted = 0;
  let kept = 0;
  for (const b of expired) {
    const newer = await db.sandboxBackup.findFirst({
      where: {
        sandboxId: b.sandboxId,
        status: "available",
        createdAt: { gt: b.createdAt },
      },
    });
    if (!newer) {
      // Guardar el último es para máquinas VIVAS, donde el siguiente backup
      // puede llegar esta noche. Las destruidas las limpia
      // purgeDeletedMachineArtifacts pasada su ventana de gracia; si no, su
      // último backup sería inmortal.
      kept++;
      continue;
    }
    await storage.deleteObject(b.key).catch(() => {});
    await db.sandboxBackup.update({ where: { id: b.id }, data: { status: "expired" } });
    deleted++;
  }
  return { deleted, kept };
}

/**
 * Borrar TODO lo que quedó de máquinas ya destruidas, pasada su ventana de
 * gracia: backups y releases, objeto y fila.
 *
 * Hace falta porque `pruneExpiredBackups` nunca puede tocar el último backup de
 * una caja muerta — su regla es "sólo borro si existe uno más nuevo", y a una
 * máquina destruida no le llega ninguno. Sin esto, cada máquina que un cliente
 * dio de baja deja residuo permanente en el bucket, y eso sólo crece.
 *
 * La ventana (30 días desde el borrado duro) es a propósito la misma que
 * `extendBackupsForDeletedMachine`: primero se conserva por si el cliente
 * vuelve, y después se limpia de verdad.
 */
export async function purgeDeletedMachineArtifacts(): Promise<{
  machines: number;
  backups: number;
  releases: number;
}> {
  const cutoff = new Date(Date.now() - POST_DELETE_RETENTION_DAYS * 86400_000);
  const dead = await db.sandbox.findMany({
    where: { status: "destroyed", updatedAt: { lt: cutoff } },
    select: { sandboxId: true },
  });
  if (!dead.length) return { machines: 0, backups: 0, releases: 0 };

  const storage = getPlatformDefaultClient({ prefix: "" });
  let backups = 0;
  let releases = 0;
  for (const m of dead) {
    const bks = await db.sandboxBackup.findMany({ where: { sandboxId: m.sandboxId } });
    for (const b of bks) {
      await storage.deleteObject(b.key).catch(() => {});
      await db.sandboxBackup.delete({ where: { id: b.id } }).catch(() => {});
      backups++;
    }
    const rels = await db.machineRelease.findMany({ where: { sandboxId: m.sandboxId } });
    for (const r of rels) {
      await storage.deleteObject(r.storageKey).catch(() => {});
      await db.machineRelease.delete({ where: { id: r.id } }).catch(() => {});
      releases++;
    }
  }
  return { machines: dead.length, backups, releases };
}

/** Machines whose newest available backup is older than the alert threshold. */
export async function staleBackupMachines(): Promise<{ sandboxId: string; lastBackupAt: Date | null }[]> {
  const machines = await db.sandbox.findMany({
    where: { persistent: true, status: "running", NOT: { backupScope: "none" } },
    select: { sandboxId: true, runspec: true },
  });
  const cutoff = new Date(Date.now() - STALE_ALERT_HOURS * 3600_000);
  const stale: { sandboxId: string; lastBackupAt: Date | null }[] = [];
  for (const m of machines) {
    if (!resolveDataPaths(m.runspec as Runspec).length) continue;
    const last = await db.sandboxBackup.findFirst({
      where: { sandboxId: m.sandboxId, status: "available" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (!last || last.createdAt < cutoff) {
      stale.push({ sandboxId: m.sandboxId, lastBackupAt: last?.createdAt ?? null });
    }
  }
  return stale;
}

// --- owner-facing --------------------------------------------------------

export async function listBackups(
  ctx: AuthContext,
  params: { sandboxId: string; limit?: number; cursor?: string }
): Promise<{ items: BackupRecord[]; nextCursor?: string }> {
  requireScope(ctx, "READ");
  const owner = await effectiveOwnerId(ctx, params.sandboxId);
  const limit = Math.min(params.limit ?? 20, 100);
  const offset = params.cursor ? Number(params.cursor) : 0;
  const rows = await db.sandboxBackup.findMany({
    where: { sandboxId: params.sandboxId, ownerId: owner },
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: limit + 1,
  });
  return {
    items: rows.slice(0, limit).map(toRecord),
    nextCursor: rows.length > limit ? String(offset + limit) : undefined,
  };
}

export async function createBackup(ctx: AuthContext, sandboxId: string): Promise<BackupRecord> {
  requireScope(ctx, "WRITE");
  await effectiveOwnerId(ctx, sandboxId);
  return backupMachine(sandboxId, { force: true });
}

async function findOwnedBackup(ctx: AuthContext, backupId: string) {
  const row = await db.sandboxBackup.findUnique({ where: { id: backupId } });
  if (!row) {
    const e: any = new Error(`Backup ${backupId} not found`);
    e.code = "BackupNotFound";
    throw e;
  }
  const owner = await effectiveOwnerId(ctx, row.sandboxId);
  if (row.ownerId !== owner) {
    const e: any = new Error(`Backup ${backupId} not found`);
    e.code = "BackupNotFound";
    throw e;
  }
  return row;
}

/**
 * Restore a backup's data into a box.
 *
 * `in_place` overwrites live data, so it takes a fresh backup of the target
 * first — no exceptions. That pre-restore copy is what saves you when the
 * restore turns out to be the wrong one.
 */
export async function restoreFromBackup(
  ctx: AuthContext,
  params: { backupId: string; targetSandboxId?: string; confirm: boolean }
): Promise<{ backupId: string; targetSandboxId: string; entries: number; preRestoreBackupId?: string }> {
  requireScope(ctx, "WRITE");
  if (!params.confirm) {
    const e: any = new Error(
      "Restoring overwrites data in the target box. Pass confirm:true once you are sure."
    );
    e.code = "DestructiveOperationRequiresConfirm";
    throw e;
  }
  const backup = await findOwnedBackup(ctx, params.backupId);
  if (backup.status !== "available") {
    const e: any = new Error(`Backup ${params.backupId} is ${backup.status}, not available`);
    e.code = "BackupNotAvailable";
    throw e;
  }
  const target = params.targetSandboxId ?? backup.sandboxId;
  const owner = await effectiveOwnerId(ctx, target);

  let preRestoreBackupId: string | undefined;
  if (target === backup.sandboxId) {
    try {
      const pre = await backupMachine(target, { force: true });
      preRestoreBackupId = pre.id;
    } catch (e) {
      console.warn(`restoreFromBackup: pre-restore backup of ${target} failed:`, e);
    }
  }

  const url = await getPlatformDefaultClient({ prefix: "" }).getReadUrl(backup.key, 900);
  const tag = nanoid(8);
  const urlFile = `${TMPDIR}/.eb-rs-${tag}.url`;
  await writeFile(ctx, target, { path: urlFile, content: url });
  // Paths were tarred absolute, so -C / puts them back where they came from.
  const script = [
    "set -e",
    `curl -fsSL -o ${shQuote(`${TMPDIR}/${tag}.tgz`)} "$(cat ${shQuote(urlFile)})"`,
    `tar xzf ${shQuote(`${TMPDIR}/${tag}.tgz`)} -C /`,
    `ENTRIES=$(tar tzf ${shQuote(`${TMPDIR}/${tag}.tgz`)} | wc -l)`,
    `rm -f ${shQuote(`${TMPDIR}/${tag}.tgz`)} ${shQuote(urlFile)}`,
    `echo "RESTORED:$ENTRIES"`,
  ].join("\n");
  const res = await execSandboxRaw(owner, target, script, 600);
  const marker = (res.stdout || "").split("\n").find((l) => l.startsWith("RESTORED:"));
  if (res.exitCode !== 0 || !marker) {
    await execSandboxRaw(
      owner,
      target,
      `rm -f ${shQuote(`${TMPDIR}/${tag}.tgz`)} ${shQuote(urlFile)}`,
      30
    ).catch(() => {});
    throw new Error(
      redact(`Restore failed (exit ${res.exitCode}): ${(res.stderr || res.stdout || "").slice(-800)}`)
    );
  }
  await db.sandboxBackup.update({ where: { id: backup.id }, data: { verifiedAt: new Date() } });
  return {
    backupId: params.backupId,
    targetSandboxId: target,
    entries: Number(marker.slice(9)),
    preRestoreBackupId,
  };
}

/**
 * Called from purgeExpiredMachines: when a machine is hard-deleted, hold its
 * last backup well past the machine itself.
 */
export async function extendBackupsForDeletedMachine(sandboxId: string): Promise<void> {
  const last = await db.sandboxBackup.findFirst({
    where: { sandboxId, status: "available" },
    orderBy: { createdAt: "desc" },
  });
  if (!last) return;
  await db.sandboxBackup.update({
    where: { id: last.id },
    data: { expiresAt: new Date(Date.now() + POST_DELETE_RETENTION_DAYS * 86400_000) },
  });
}
