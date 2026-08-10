/**
 * Releases: making a permanent machine REPRODUCIBLE.
 *
 * Fly, Vercel and Netlify can treat a machine's disk as disposable because a
 * deploy rebuilds it from an image. Here the customer's app is written INTO the
 * box by an agent (files/write + exec), so a dead box loses the app itself, not
 * just its data. A release fixes that: a versioned tarball of the app code in
 * object storage, plus a `runspec` describing how to build and run it. With
 * both, any box is recreatable — which also makes "resize" possible (recreate
 * at another tier) without a host-side resize primitive.
 *
 * Release = CODE. Backups (machineBackupOperations) = DATA. A box recreated
 * from a release starts empty; restoring data is a separate, explicit step.
 *
 * TRANSPORT — two rules learned the hard way, do not "simplify" them away:
 *  1. Never `tar | base64` through exec stdout. backupOperations.ts:11-13
 *     documents the truncation cap; a silently-cut tarball is a fake backup.
 *  2. Never `tar | curl -T -`. Piping makes curl send Transfer-Encoding:
 *     chunked with no Content-Length, and S3/Tigris rejects presigned PUTs
 *     without one. Always tar to a FILE, then `curl -T <file>`.
 * So the bytes go straight from the box to Tigris over a presigned URL, and
 * only ~80 bytes (sha + size) come back through exec.
 */

import { z } from "zod";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { db } from "../db";
import {
  effectiveOwnerId,
  execSandboxRaw,
  getSandbox,
  runtimeControl,
  shQuote,
  writeFile,
} from "./sandboxOperations";
import { createPermanent, releasePermanent } from "./machineOperations";
import { getPlatformDefaultClient } from "../storage";
import { nanoid } from "nanoid";

/** Where the tarball is staged inside the box before upload. */
const TMPDIR = process.env.RELEASE_TMPDIR || "/tmp";
/** Refuse to publish anything bigger than this (bytes). Checked BEFORE upload. */
const MAX_BYTES = Number(process.env.RELEASE_MAX_BYTES || 2 * 1024 * 1024 * 1024);
/** Releases kept per machine; older ones are pruned. */
const KEEP_PER_SANDBOX = Number(process.env.RELEASE_KEEP || 10);
/** Presigned PUT lifetime. Short — the URL is a write capability on our bucket. */
const PUT_TTL_SECONDS = 3600;

const DEFAULT_EXCLUDES = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".cache",
  "__pycache__",
  ".venv",
  "target",
];

// Secrets must NOT live in the runspec: it is stored in Mongo AND embedded in
// every release tarball. They keep coming from the owner's vault and get
// injected at boot, the way createPermanent already does with `env`.
const SECRETISH = /(_KEY|_TOKEN|_SECRET|PASSWORD|_PWD|_DSN|CREDENTIAL)$/i;

export const runspecSchema = z.object({
  appDir: z.string().min(1).startsWith("/"),
  buildCommand: z.string().optional(),
  startCommand: z.string().optional(),
  unit: z.string().optional(),
  port: z.number().int().positive().max(65535).optional(),
  buildTimeoutSec: z.number().int().positive().max(3600).optional(),
  excludes: z.array(z.string()).optional(),
  /** Paths (relative to appDir, or absolute) the daily backup captures. */
  dataPaths: z.array(z.string()).optional(),
  env: z
    .record(z.string())
    .optional()
    .refine(
      (env) => !env || !Object.keys(env).some((k) => SECRETISH.test(k)),
      {
        message:
          "runspec.env must not carry secrets (it is stored in the DB and baked into every release tarball). Put secrets in the vault and inject them at boot.",
      }
    ),
});

export type Runspec = z.infer<typeof runspecSchema>;

export interface ReleaseRecord {
  releaseId: string;
  sandboxId: string;
  version: number;
  sizeBytes: number;
  sha256: string | null;
  status: string;
  message: string | null;
  tier: string | null;
  template: string | null;
  runspec: Runspec | null;
  createdAt: Date;
}

function toRecord(r: any): ReleaseRecord {
  return {
    releaseId: r.releaseId,
    sandboxId: r.sandboxId,
    version: r.version,
    sizeBytes: Number(r.sizeBytes ?? 0),
    sha256: r.sha256 ?? null,
    status: r.status,
    message: r.message ?? null,
    tier: r.tier ?? null,
    template: r.template ?? null,
    runspec: (r.runspec as Runspec) ?? null,
    createdAt: r.createdAt,
  };
}

/** Strip the signature out of anything we might log or hand back. */
function redact(s: string): string {
  return s.replace(/X-Amz-Signature=[^&\s"']+/g, "X-Amz-Signature=REDACTED");
}

/**
 * The publish command, as a pure function so the transport rules can be pinned
 * by a test. Both of them are counter-intuitive enough that someone WILL try to
 * "clean them up" into a one-liner:
 *  - tar goes to a FILE, never through stdout as base64 (exec truncates);
 *  - curl uploads with -T <file>, never from a pipe (a pipe means chunked
 *    encoding with no Content-Length, which a presigned PUT rejects).
 * The signed URL is read from a file so it never lands on a command line.
 */
export function buildPublishScript(args: {
  spec: Runspec;
  tarball: string;
  urlFile: string;
  maxBytes?: number;
}): string {
  const { spec, tarball, urlFile } = args;
  const maxBytes = args.maxBytes ?? MAX_BYTES;
  const excludes = [...DEFAULT_EXCLUDES, ...(spec.excludes ?? [])]
    .map((x) => `--exclude=${shQuote(x)}`)
    .join(" ");
  return [
    "set -e",
    `cd ${shQuote(spec.appDir)}`,
    `tar czf ${shQuote(tarball)} ${excludes} .`,
    `SIZE=$(stat -c%s ${shQuote(tarball)})`,
    // Bail BEFORE spending bandwidth on something we would reject anyway.
    `if [ "$SIZE" -gt ${maxBytes} ]; then rm -f ${shQuote(tarball)} ${shQuote(urlFile)}; echo "TOOBIG:$SIZE"; exit 0; fi`,
    `SHA=$(sha256sum ${shQuote(tarball)} | cut -d" " -f1)`,
    `curl -fsS -X PUT -T ${shQuote(tarball)} -H "Content-Type: application/gzip" "$(cat ${shQuote(urlFile)})"`,
    `rm -f ${shQuote(tarball)} ${shQuote(urlFile)}`,
    `echo "OK:$SHA:$SIZE"`,
  ].join("\n");
}

async function requireMachine(ctx: AuthContext, sandboxId: string) {
  const owner = await effectiveOwnerId(ctx, sandboxId);
  const row = await db.sandbox.findUnique({ where: { sandboxId } });
  if (!row || row.ownerId !== owner) {
    const e: any = new Error(`Machine ${sandboxId} not found`);
    e.code = "MachineNotFound";
    throw e;
  }
  return { row, owner };
}

// --- runspec ---------------------------------------------------------------

export async function getRunspec(ctx: AuthContext, sandboxId: string): Promise<Runspec | null> {
  requireScope(ctx, "READ");
  const { row } = await requireMachine(ctx, sandboxId);
  return (row.runspec as Runspec) ?? null;
}

/**
 * Merge-and-persist. The DB is the source of truth; the copy written into the
 * box (`<appDir>/easybits.json`) only makes the tarball self-describing.
 */
export async function setRunspec(
  ctx: AuthContext,
  sandboxId: string,
  patch: Partial<Runspec>
): Promise<Runspec> {
  requireScope(ctx, "WRITE");
  const { row } = await requireMachine(ctx, sandboxId);
  const merged = runspecSchema.parse({ ...((row.runspec as object) ?? {}), ...patch });
  await db.sandbox.update({ where: { sandboxId }, data: { runspec: merged } });
  // Best-effort mirror — a suspended box must not block a config change.
  try {
    await writeFile(ctx, sandboxId, {
      path: `${merged.appDir.replace(/\/$/, "")}/easybits.json`,
      content: JSON.stringify(merged, null, 2),
    });
  } catch (e) {
    console.warn(`setRunspec: could not mirror easybits.json into ${sandboxId}:`, e);
  }
  return merged;
}

// --- publish ---------------------------------------------------------------

/**
 * Fail loudly if the box lacks the tooling, instead of producing a corrupt
 * tarball that only reveals itself on the day someone needs to restore.
 */
async function preflight(owner: string, sandboxId: string): Promise<void> {
  const res = await execSandboxRaw(
    owner,
    sandboxId,
    "for b in tar gzip curl sha256sum; do command -v $b >/dev/null || echo MISSING:$b; done",
    30
  );
  const missing = (res.stdout || "")
    .split("\n")
    .filter((l) => l.startsWith("MISSING:"))
    .map((l) => l.slice(8));
  if (missing.length) {
    const e: any = new Error(
      `Box is missing required tooling: ${missing.join(", ")}. Install it (e.g. apt-get install -y ${missing.join(" ")}) and retry.`
    );
    e.code = "ReleaseToolingMissing";
    throw e;
  }
}

export async function publishRelease(
  ctx: AuthContext,
  sandboxId: string,
  params: { message?: string } = {}
): Promise<ReleaseRecord> {
  requireScope(ctx, "WRITE");
  const { row, owner } = await requireMachine(ctx, sandboxId);
  const spec = (row.runspec as Runspec) ?? null;
  if (!spec) {
    const e: any = new Error(
      "This machine has no runspec — call set_machine_runspec first (at minimum appDir, plus buildCommand/startCommand or unit)."
    );
    e.code = "RunspecMissing";
    throw e;
  }

  // One publish at a time per box: two concurrent tars of the same tree would
  // race on the staging file and produce garbage.
  const inflight = await db.machineRelease.findFirst({
    where: {
      sandboxId,
      status: "pending",
      createdAt: { gt: new Date(Date.now() - 10 * 60_000) },
    },
  });
  if (inflight) {
    const e: any = new Error(`A release is already being published for ${sandboxId}`);
    e.code = "ReleaseInProgress";
    throw e;
  }

  await preflight(owner, sandboxId);

  const releaseId = `rel_${nanoid(12)}`;
  const storageKey = `releases/${owner}/${sandboxId}/${releaseId}.tar.gz`;
  const last = await db.machineRelease.findFirst({
    where: { sandboxId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (last?.version ?? 0) + 1;

  const created = await db.machineRelease.create({
    data: {
      ownerId: owner,
      releaseId,
      sandboxId,
      version,
      storageKey,
      runspec: spec,
      tier: row.tier,
      template: row.template,
      message: params.message ?? null,
      status: "pending",
    },
  });

  const storage = getPlatformDefaultClient({ prefix: "" });

  try {
    const putUrl = await storage.getPutUrl(storageKey, { timeout: PUT_TTL_SECONDS });
    // The presigned URL is a write capability on our bucket, so it never goes
    // on a command line (journald, ps, exec logs). It lands in a file we always
    // remove, and is read back with $(cat).
    const urlFile = `${TMPDIR}/.eb-${releaseId}.url`;
    await writeFile(ctx, sandboxId, { path: urlFile, content: putUrl });

    const tarball = `${TMPDIR}/${releaseId}.tar.gz`;
    const script = buildPublishScript({ spec, tarball, urlFile });

    const timeout = Math.min(spec.buildTimeoutSec ?? 600, 600);
    const res = await execSandboxRaw(owner, sandboxId, script, timeout);
    // Cleanup is best-effort: if the script died mid-way the staging file and
    // the URL file would otherwise linger inside the customer's box.
    if (res.exitCode !== 0) {
      await execSandboxRaw(
        owner,
        sandboxId,
        `rm -f ${shQuote(`${TMPDIR}/${releaseId}.tar.gz`)} ${shQuote(urlFile)}`,
        30
      ).catch(() => {});
    }

    const out = (res.stdout || "").trim();
    const tooBig = out.split("\n").find((l) => l.startsWith("TOOBIG:"));
    if (tooBig) {
      const e: any = new Error(
        `App tarball is ${tooBig.slice(7)} bytes, over the ${MAX_BYTES} limit. Tighten runspec.excludes.`
      );
      e.code = "ReleaseTooLarge";
      throw e;
    }
    if (res.exitCode !== 0 || res.truncated) {
      throw new Error(
        redact(`Publish failed (exit ${res.exitCode}): ${(res.stderr || res.stdout || "").slice(-800)}`)
      );
    }
    const ok = out.split("\n").find((l) => l.startsWith("OK:"));
    if (!ok) throw new Error(redact(`Publish produced no result marker: ${out.slice(-400)}`));
    const [, sha256, sizeStr] = ok.split(":");
    const reported = Number(sizeStr);

    // The box says it uploaded N bytes. Confirm against the bucket before this
    // release is allowed to look usable — an unverified release is exactly the
    // kind of thing that "works" until the day it has to.
    const head = await storage.headObject(storageKey);
    if (!head) throw new Error("Upload reported success but the object is not in storage");
    if (head.size !== reported) {
      throw new Error(`Size mismatch: box reported ${reported} bytes, storage has ${head.size}`);
    }

    const updated = await db.machineRelease.update({
      where: { id: created.id },
      data: { status: "available", sha256, sizeBytes: BigInt(reported) },
    });
    await db.sandbox.update({ where: { sandboxId }, data: { currentReleaseId: releaseId } });
    await pruneOldReleases(owner, sandboxId);
    return toRecord(updated);
  } catch (err: any) {
    await db.machineRelease
      .update({
        where: { id: created.id },
        data: { status: "failed", error: redact(String(err?.message ?? err)).slice(0, 900) },
      })
      .catch(() => {});
    // Never leave a half-written object behind pretending to be a release.
    await storage.deleteObject(storageKey).catch(() => {});
    throw err;
  }
}

/** Keep the newest N releases per machine; drop object + row for the rest. */
async function pruneOldReleases(ownerId: string, sandboxId: string): Promise<void> {
  const rows = await db.machineRelease.findMany({
    where: { sandboxId, status: "available" },
    orderBy: { version: "desc" },
    skip: KEEP_PER_SANDBOX,
  });
  if (!rows.length) return;
  const storage = getPlatformDefaultClient({ prefix: "" });
  for (const r of rows) {
    await storage.deleteObject(r.storageKey).catch(() => {});
    await db.machineRelease.delete({ where: { id: r.id } }).catch(() => {});
  }
}

// --- read ------------------------------------------------------------------

export async function listReleases(
  ctx: AuthContext,
  params: { sandboxId?: string; limit?: number; cursor?: string } = {}
): Promise<{ items: ReleaseRecord[]; nextCursor?: string }> {
  requireScope(ctx, "READ");
  const limit = Math.min(params.limit ?? 20, 100);
  const ownerId = params.sandboxId
    ? (await requireMachine(ctx, params.sandboxId)).owner
    : ctx.user.id;
  const offset = params.cursor ? Number(params.cursor) : 0;
  const rows = await db.machineRelease.findMany({
    where: { ownerId, ...(params.sandboxId ? { sandboxId: params.sandboxId } : {}) },
    orderBy: [{ sandboxId: "asc" }, { version: "desc" }],
    skip: offset,
    take: limit + 1,
  });
  const items = rows.slice(0, limit).map(toRecord);
  return {
    items,
    nextCursor: rows.length > limit ? String(offset + limit) : undefined,
  };
}

export async function getRelease(
  ctx: AuthContext,
  releaseId: string,
  opts: { withDownloadUrl?: boolean } = {}
): Promise<ReleaseRecord & { downloadUrl?: string }> {
  requireScope(ctx, "READ");
  const row = await findOwnedRelease(ctx, releaseId);
  const rec = toRecord(row);
  if (!opts.withDownloadUrl) return rec;
  const url = await getPlatformDefaultClient({ prefix: "" }).getReadUrl(row.storageKey, 900);
  return { ...rec, downloadUrl: url };
}

async function findOwnedRelease(ctx: AuthContext, releaseId: string) {
  const row = await db.machineRelease.findUnique({ where: { releaseId } });
  if (!row) {
    const e: any = new Error(`Release ${releaseId} not found`);
    e.code = "ReleaseNotFound";
    throw e;
  }
  // Delegated access is granted per-machine, so authorize through the machine.
  await requireMachine(ctx, row.sandboxId).catch(() => {
    if (row.ownerId !== ctx.user.id) {
      const e: any = new Error(`Release ${releaseId} not found`);
      e.code = "ReleaseNotFound";
      throw e;
    }
  });
  return row;
}

export async function deleteRelease(ctx: AuthContext, releaseId: string): Promise<{ ok: true }> {
  requireScope(ctx, "DELETE");
  const row = await findOwnedRelease(ctx, releaseId);
  const inUse = await db.sandbox.findFirst({
    where: { currentReleaseId: releaseId, status: { notIn: ["destroyed"] } },
  });
  if (inUse) {
    const e: any = new Error(
      `Release ${releaseId} is the one currently deployed on ${inUse.sandboxId}. Deploy or roll back to another release first.`
    );
    e.code = "ReleaseInUse";
    throw e;
  }
  await getPlatformDefaultClient({ prefix: "" }).deleteObject(row.storageKey).catch(() => {});
  await db.machineRelease.delete({ where: { id: row.id } });
  return { ok: true };
}

// --- deploy / rollback -----------------------------------------------------

/**
 * Download + unpack a release into a box, atomically: it lands in a sibling
 * directory and only swaps in once the untar succeeded, so a failed download
 * can't leave the app half-overwritten.
 */
async function unpackInto(
  ctx: AuthContext,
  sandboxId: string,
  ownerId: string,
  storageKey: string,
  appDir: string
): Promise<void> {
  const url = await getPlatformDefaultClient({ prefix: "" }).getReadUrl(storageKey, 900);
  const stamp = nanoid(8);
  const urlFile = `${TMPDIR}/.eb-get-${stamp}.url`;
  await writeFile(ctx, sandboxId, { path: urlFile, content: url });
  const dir = appDir.replace(/\/$/, "");
  const staging = `${dir}.new-${stamp}`;
  const old = `${dir}.old-${stamp}`;
  const script = [
    "set -e",
    `rm -rf ${shQuote(staging)} && mkdir -p ${shQuote(staging)}`,
    `curl -fsSL -o ${shQuote(`${TMPDIR}/${stamp}.tgz`)} "$(cat ${shQuote(urlFile)})"`,
    `tar xzf ${shQuote(`${TMPDIR}/${stamp}.tgz`)} -C ${shQuote(staging)}`,
    `if [ -d ${shQuote(dir)} ]; then mv ${shQuote(dir)} ${shQuote(old)}; fi`,
    `mv ${shQuote(staging)} ${shQuote(dir)}`,
    `rm -rf ${shQuote(old)} ${shQuote(`${TMPDIR}/${stamp}.tgz`)} ${shQuote(urlFile)}`,
    "echo UNPACK_OK",
  ].join("\n");
  const res = await execSandboxRaw(ownerId, sandboxId, script, 300);
  if (res.exitCode !== 0 || !(res.stdout || "").includes("UNPACK_OK")) {
    await execSandboxRaw(
      ownerId,
      sandboxId,
      `rm -rf ${shQuote(staging)} ${shQuote(`${TMPDIR}/${stamp}.tgz`)} ${shQuote(urlFile)}`,
      30
    ).catch(() => {});
    throw new Error(
      redact(`Unpack failed (exit ${res.exitCode}): ${(res.stderr || res.stdout || "").slice(-800)}`)
    );
  }
}

/** Build + start, honouring the runspec. Prefers a systemd unit over a raw command. */
async function buildAndStart(
  ctx: AuthContext,
  sandboxId: string,
  ownerId: string,
  spec: Runspec
): Promise<{ buildOutput?: string; startOutput?: string; exitCode: number }> {
  let buildOutput: string | undefined;
  if (spec.buildCommand) {
    const r = await runtimeControl(ctx, sandboxId, {
      action: "rebuild",
      buildCommand: spec.buildCommand,
      cwd: spec.appDir,
      unit: spec.unit,
    });
    buildOutput = r.buildOutput;
    // A failed build must NOT be followed by a restart — you keep the daemon
    // that currently works. runtimeControl already enforces that; surface it.
    if (r.exitCode !== 0) return { buildOutput, startOutput: r.output, exitCode: r.exitCode };
    if (spec.unit) return { buildOutput, startOutput: r.output, exitCode: 0 };
  } else if (spec.unit) {
    const r = await runtimeControl(ctx, sandboxId, { action: "restart", unit: spec.unit });
    return { startOutput: r.output, exitCode: r.exitCode };
  }
  if (spec.startCommand) {
    const res = await execSandboxRaw(
      ownerId,
      sandboxId,
      `cd ${shQuote(spec.appDir)} && (nohup ${spec.startCommand} >/var/log/easybits-app.log 2>&1 &) && sleep 2 && echo STARTED`,
      60
    );
    return { buildOutput, startOutput: res.stdout || res.stderr, exitCode: res.exitCode };
  }
  return { buildOutput, exitCode: 0 };
}

/** Roll the SAME box back (or forward) to a given release, in place. */
export async function applyRelease(
  ctx: AuthContext,
  sandboxId: string,
  releaseId: string
): Promise<{ sandboxId: string; releaseId: string; version: number; exitCode: number; buildOutput?: string }> {
  requireScope(ctx, "WRITE");
  const { owner } = await requireMachine(ctx, sandboxId);
  const rel = await findOwnedRelease(ctx, releaseId);
  if (rel.status !== "available") {
    const e: any = new Error(`Release ${releaseId} is ${rel.status}, not available`);
    e.code = "ReleaseNotAvailable";
    throw e;
  }
  const spec = runspecSchema.parse(rel.runspec ?? {});
  await unpackInto(ctx, sandboxId, owner, rel.storageKey, spec.appDir);
  const started = await buildAndStart(ctx, sandboxId, owner, spec);
  await db.sandbox.update({
    where: { sandboxId },
    data: { currentReleaseId: releaseId, runspec: spec },
  });
  return {
    sandboxId,
    releaseId,
    version: rel.version,
    exitCode: started.exitCode,
    buildOutput: started.buildOutput,
  };
}

/**
 * Build a BRAND NEW box from a release. One code path serves both jobs that
 * matter: recovering a machine that died, and changing tier (the resize the
 * host has no primitive for).
 *
 * `replaceSandboxId` releases the old machine once the new one is confirmed
 * running — without it a "resize" quietly bills the customer twice. The old
 * machine keeps its 7-day soft-delete window, which is the rollback.
 */
export async function recreateFromRelease(
  ctx: AuthContext,
  params: {
    releaseId: string;
    tier?: string;
    name?: string;
    cpuMode?: "shared" | "reserved";
    diskAddonsGB?: number;
    replaceSandboxId?: string;
  }
): Promise<{ sandboxId: string; releaseId: string; exitCode: number; buildOutput?: string; replaced?: string }> {
  requireScope(ctx, "WRITE");
  const rel = await findOwnedRelease(ctx, params.releaseId);
  if (rel.status !== "available") {
    const e: any = new Error(`Release ${params.releaseId} is ${rel.status}, not available`);
    e.code = "ReleaseNotAvailable";
    throw e;
  }
  const spec = runspecSchema.parse(rel.runspec ?? {});

  const created = await createPermanent(ctx, {
    tier: params.tier ?? rel.tier ?? "micro",
    template: (rel.template as any) ?? undefined,
    name: params.name ?? `${rel.sandboxId}-r${rel.version}`,
    cpuMode: params.cpuMode,
    diskAddonsGB: params.diskAddonsGB,
    env: spec.env,
  });

  try {
    const owner = await effectiveOwnerId(ctx, created.sandboxId);
    await unpackInto(ctx, created.sandboxId, owner, rel.storageKey, spec.appDir);
    const started = await buildAndStart(ctx, created.sandboxId, owner, spec);
    await db.sandbox.update({
      where: { sandboxId: created.sandboxId },
      data: { runspec: spec, currentReleaseId: rel.releaseId, backupScope: "data" },
    });

    let replaced: string | undefined;
    if (params.replaceSandboxId && started.exitCode === 0) {
      // Only after the replacement is actually up. Soft-delete keeps the old
      // box restorable for 7 days if this turns out to be wrong.
      const box = await getSandbox(ctx, created.sandboxId).catch(() => null);
      if (box?.status === "running") {
        await releasePermanent(ctx, params.replaceSandboxId);
        replaced = params.replaceSandboxId;
      }
    }
    return {
      sandboxId: created.sandboxId,
      releaseId: rel.releaseId,
      exitCode: started.exitCode,
      buildOutput: started.buildOutput,
      replaced,
    };
  } catch (err) {
    // The box exists and is billed; leaving it orphaned after a failed deploy
    // would charge for nothing. Release it (soft-delete, still restorable).
    await releasePermanent(ctx, created.sandboxId).catch(() => {});
    throw err;
  }
}
