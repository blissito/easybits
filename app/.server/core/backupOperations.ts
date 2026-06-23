// Off-box backup of permanent agent (Nanoclaw/WhatsApp) state to Tigris.
//
// The critical data for a migrated WhatsApp agent is NOT the VM — it's the
// Baileys session (store/auth/creds.json + multi-file keys), the per-group
// config (groups/<g>/CLAUDE.md, catalog, products) and message history
// (store/messages.db). The VM's volume dies with the VM (storage Phase 2 not
// shipped), so we snapshot these dirs out to object storage on a schedule. A
// destroyed/lost box is then re-hydratable in minutes: spawn a fresh permanent
// agent, write the tar back, it boots already paired.
//
// Transport: we exec `tar | base64` inside the VM and pull stdout. Robust for
// the KB–few-MB of auth+config; large message DBs may hit the exec stdout cap
// (reported via `truncated`). Streaming straight to storage is a later upgrade.
import { db } from "../db";
import { execSandboxRaw } from "./sandboxOperations";
import { getPlatformDefaultClient } from "../storage";

// Working dir of the agent runtime inside the VM, and the state dirs to capture
// (relative to it). Overridable per-deployment; defaults match the openclaw/
// nanoclaw image layout (cwd=/app, state under store/ + groups/).
// Flagship nanoclaw/ghostyclaw layout: the runtime lives at /home/nanoclaw/app
// and ALL persistent state sits on the volume at .../app/data — start-runtime.sh
// symlinks store/, groups/ and auth_info_baileys/ into it. We back up `data`
// directly (tar does NOT follow the symlinks, so archiving store/groups would
// only capture the links, not the contents). Override per-template via env.
const WORKDIR = process.env.AGENT_BACKUP_WORKDIR || "/home/nanoclaw/app";
const PATHS = (process.env.AGENT_BACKUP_PATHS || "data")
  .split(/\s+/)
  .filter(Boolean);

export interface AgentBackupResult {
  sandboxId: string;
  ownerId: string;
  ok: boolean;
  bytes?: number;
  key?: string;
  truncated?: boolean;
  error?: string;
}

// Resolve which permanent boxes to back up. Explicit allowlist via
// AGENT_BACKUP_SANDBOX_IDS (comma-separated) for tight scoping (e.g. the
// migrated client agents only); otherwise every running persistent sandbox.
async function targets(): Promise<{ sandboxId: string; ownerId: string }[]> {
  const explicit = (process.env.AGENT_BACKUP_SANDBOX_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const where = explicit.length
    ? { sandboxId: { in: explicit }, status: "running" }
    : { persistent: true, status: "running" };
  const rows = await db.sandbox.findMany({
    where,
    select: { sandboxId: true, ownerId: true },
  });
  return rows;
}

async function backupOne(
  sandboxId: string,
  ownerId: string,
  stamp: string
): Promise<AgentBackupResult> {
  const list = PATHS.join(" ");
  // cd into the runtime dir, tar the state dirs, base64 so it survives the
  // text stdout channel. `-w0` keeps it single-line; coreutils base64 supports it.
  const command = `cd ${WORKDIR} && tar czf - ${list} 2>/dev/null | base64 -w0`;
  let res;
  try {
    res = await execSandboxRaw(ownerId, sandboxId, command, 180);
  } catch (e) {
    return { sandboxId, ownerId, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (res.exitCode !== 0 || !res.stdout) {
    return {
      sandboxId,
      ownerId,
      ok: false,
      error: `tar exit ${res.exitCode}: ${(res.stderr || "").slice(0, 200)}`,
    };
  }
  // A truncated exec stdout = a corrupt, unrestorable archive. NEVER upload it
  // as if valid — a silent bad backup is worse than no backup. Fail loudly so
  // the operator switches this box to a streaming/volume-snapshot path.
  if (res.truncated) {
    return {
      sandboxId,
      ownerId,
      ok: false,
      truncated: true,
      error: "backup exceeded exec stdout limit; archive not stored (use streaming backup for this box)",
    };
  }
  const buf = Buffer.from(res.stdout, "base64");
  const key = `backups/agents/${sandboxId}/${stamp}.tar.gz`;
  await getPlatformDefaultClient({ prefix: "" }).putObject(key, buf, "application/gzip");
  return { sandboxId, ownerId, ok: true, bytes: buf.length, key, truncated: res.truncated };
}

export async function backupPermanentAgents(): Promise<{
  ran: number;
  ok: number;
  failed: number;
  results: AgentBackupResult[];
}> {
  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const rows = await targets();
  const results: AgentBackupResult[] = [];
  // Sequential: a handful of boxes, and base64 payloads are sizeable — avoid
  // hammering the host with concurrent large execs.
  for (const r of rows) {
    results.push(await backupOne(r.sandboxId, r.ownerId, stamp));
  }
  const ok = results.filter((r) => r.ok).length;
  return { ran: results.length, ok, failed: results.length - ok, results };
}
