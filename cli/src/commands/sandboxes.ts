import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Sandbox } from "@easybits.cloud/sdk";
import type { Command, Ctx } from "../types.js";
import { ENV_FILE_OPTION, bool, envFrom, int, list, need, readStdin, str } from "../args.js";
import { emit, fmtBytes, fmtDate, table } from "../output.js";
import { getClient } from "../client.js";
import { CliError, usageError } from "../errors.js";
import { YES_OPTION, confirm, requireYesIfHeadless } from "../prompt.js";
import { t } from "../i18n.js";
import { sandboxDomains } from "./domains.js";

/** Registro plano de una caja: la clase Sandbox lleva handles internos que no son datos. */
export function sandboxRecord(s: Sandbox) {
  return {
    sandboxId: s.sandboxId,
    name: s.name,
    template: s.template,
    status: s.status,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    persistent: s.persistent,
    tier: s.tier,
    cpuMode: s.cpuMode,
    monthlyMxn: s.monthlyMxn,
    metadata: s.metadata,
    activity: s.activity,
  };
}

function printSandbox(s: ReturnType<typeof sandboxRecord>) {
  console.log(`ID:        ${s.sandboxId}`);
  if (s.name) console.log(`${t("Name:     ", "Nombre:   ")} ${s.name}`);
  console.log(`Template:  ${s.template}`);
  console.log(`${t("Status:   ", "Estado:   ")} ${s.status}`);
  // Mientras hay un snapshot/fork en curso la caja contesta 409 SandboxBusy a todo lo demás.
  if (s.activity) console.log(t(`Activity:  ${s.activity} (busy: exec/suspend/destroy answer 409 SandboxBusy until it ends)`, `Actividad: ${s.activity} (ocupado: exec/suspend/destroy contestan 409 SandboxBusy hasta que termine)`));
  console.log(`${t("Created:  ", "Creado:   ")} ${fmtDate(s.createdAt)}`);
  console.log(`${t("Expires:  ", "Vence:    ")} ${s.persistent ? t("never (permanent)", "nunca (permanente)") : fmtDate(s.expiresAt)}`);
  if (s.tier) console.log(`Tier:      ${s.tier}${s.monthlyMxn != null ? ` ($${s.monthlyMxn} MXN/${t("month", "mes")})` : ""}`);
}

async function sandbox(ctx: Ctx, usage: string) {
  const id = need(ctx, 0, "sandbox", usage);
  const eb = await getClient(ctx);
  return eb.sandboxes.get(id);
}

// El agente de la caja corta toda lectura en 8 MB sin avisar: si llega justo eso, el
// archivo venía más grande y lo que tenemos está truncado (una base SQLite cortada no abre).
const FILE_READ_CAP = 8 << 20;

function checkNotTruncated(size: number, path: string) {
  if (size < FILE_READ_CAP) return;
  throw new CliError(
    t(`${path} is 8 MB or larger and the read was cut at 8 MB.`, `${path} pesa 8 MB o más y la lectura se cortó en 8 MB.`),
    1,
    t("Compress or split it inside the sandbox first (exec), then read the pieces.", "Comprímelo o pártelo dentro de la caja (exec) y lee las partes."),
    "truncated",
  );
}

const BG_USAGE = "easybits sandboxes bg <start|ls|status|kill> <sandbox> [exec-id] [--cwd <dir>] [--dotenv <path>] [--grace <s>] [-- <command...>]";

export const GIT_OPS = ["clone", "status", "commit", "push", "pull", "checkout", "log"] as const;
const GIT_USAGE = `easybits sandboxes git <${GIT_OPS.join("|")}> <sandbox> --dir <dir> [flags]`;

type GitFlags = {
  dir?: string; repo?: string; branch?: string; depth?: number; sha?: string; token?: string; username?: string;
  message?: string; all?: boolean; paths?: string[]; authorName?: string; authorEmail?: string; remote?: string;
  setUpstream?: boolean; force?: boolean; rebase?: boolean; create?: boolean; from?: string; limit?: number;
};

/** Banderas → parámetros del SDK (`sb.git.<op>`), validando lo que exige cada operación. Puro. */
export function gitParams(op: string, f: GitFlags): Record<string, unknown> {
  if (!(GIT_OPS as readonly string[]).includes(op)) throw usageError(t(`Unknown git operation "${op}".`, `Operación de git desconocida "${op}".`), GIT_USAGE);
  if (!f.dir) throw usageError(t("Missing --dir (the repo folder inside the sandbox).", "Falta --dir (la carpeta del repo dentro del sandbox)."), GIT_USAGE);
  if (f.token && !f.token.startsWith("$secret:")) {
    // No se prohíbe (un token de corta vida en CI), pero se avisa: argv lo ven ps y el historial.
    process.stderr.write(t("Warning: a literal token in argv shows up in ps and shell history; prefer --git-token '$secret:NAME'.\n", "Aviso: un token literal en argv se ve en ps y el historial; mejor --git-token '$secret:NOMBRE'.\n"));
  }
  const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== false && !(Array.isArray(v) && !v.length)));
  const auth = { token: f.token, username: f.username };
  switch (op) {
    case "clone":
      if (!f.repo) throw usageError(t("clone needs --repo <url>.", "clone necesita --repo <url>."), GIT_USAGE);
      return clean({ repo: f.repo, dir: f.dir, branch: f.branch, depth: f.depth, commit: f.sha, ...auth });
    case "status":
      return { dir: f.dir };
    case "commit":
      if (!f.message) throw usageError(t("commit needs -m <message>.", "commit necesita -m <mensaje>."), GIT_USAGE);
      return clean({ dir: f.dir, message: f.message, addAll: f.all, paths: f.paths, authorName: f.authorName, authorEmail: f.authorEmail });
    case "push":
      return clean({ dir: f.dir, remote: f.remote, branch: f.branch, setUpstream: f.setUpstream, force: f.force, ...auth });
    case "pull":
      return clean({ dir: f.dir, rebase: f.rebase, ...auth });
    case "checkout":
      if (!f.branch) throw usageError(t("checkout needs --branch <name>.", "checkout necesita --branch <nombre>."), GIT_USAGE);
      return clean({ dir: f.dir, branch: f.branch, create: f.create, from: f.from });
    default:
      return clean({ dir: f.dir, limit: f.limit, path: f.paths?.[0] });
  }
}

function printGit(op: string, r: any) {
  if (op === "clone") console.log(t(`Cloned ${r.remote} → ${r.dir} (${r.detached ? "detached" : r.branch} @ ${String(r.head).slice(0, 7)})`, `Clonado ${r.remote} → ${r.dir} (${r.detached ? "desprendido" : r.branch} @ ${String(r.head).slice(0, 7)})`));
  else if (op === "status") {
    console.log(`${r.branch}${r.upstream ? ` → ${r.upstream}` : ""}${r.ahead || r.behind ? `  +${r.ahead} -${r.behind}` : ""}${r.clean ? t("  (clean)", "  (limpio)") : ""}`);
    for (const [k, label] of [["staged", "staged"], ["modified", "modified"], ["untracked", "untracked"], ["conflicted", "conflicted"]] as const) {
      if (r[k]?.length) console.log(`  ${label}: ${r[k].join(", ")}`);
    }
  } else if (op === "commit") console.log(r.nothingToCommit ? t("Nothing to commit.", "Nada que commitear.") : `${t("Committed", "Commit")} ${String(r.sha).slice(0, 7)}`);
  else if (op === "push") console.log(r.pushed ? t(`Pushed ${r.branch} to ${r.remote}`, `Subido ${r.branch} a ${r.remote}`) : r.output);
  else if (op === "pull") {
    console.log(r.updated ? t(`Updated to ${String(r.head).slice(0, 7)}`, `Actualizado a ${String(r.head).slice(0, 7)}`) : t("Already up to date.", "Ya estaba al día."));
    if (r.conflicts?.length) console.log(t(`Conflicts: ${r.conflicts.join(", ")}`, `Conflictos: ${r.conflicts.join(", ")}`));
  } else if (op === "checkout") console.log(t(`On ${r.branch}${r.created ? " (new)" : ""}`, `En ${r.branch}${r.created ? " (nueva)" : ""}`));
  else
    table(
      r.items.map((e: any) => ({ ...e, sha: String(e.sha).slice(0, 7), date: fmtDate(e.date) })),
      [["sha", "SHA"], ["date", "DATE"], ["author", "AUTHOR"], ["message", "MESSAGE"]],
    );
}

/** El sandbox del posicional `i` (bg y git llevan la acción primero). */
async function sandboxAt(ctx: Ctx, i: number, usage: string) {
  return (await getClient(ctx)).sandboxes.get(need(ctx, i, "sandbox", usage));
}

const FILES_USAGE = "easybits sandboxes files <ls|read|write|rm|mv|mkdir> <sandbox> <path> [local-file|new-path]";

export const sandboxes: Command = {
  name: "sandboxes",
  aliases: ["sandbox", "sb"],
  group: "Compute",
  summary: "Firecracker microVMs (alias: sb)",
  synopsis: "sandboxes",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List your sandboxes",
      usage: "easybits sandboxes ls",
      examples: ["easybits sandboxes ls", "easybits sb ls --json"],
      async run(ctx) {
        const eb = await getClient(ctx);
        const rows = (await eb.sandboxes.list()).map(sandboxRecord);
        emit(ctx, rows, () =>
          table(
            rows.map((r) => ({ ...r, expires: r.persistent ? "permanent" : fmtDate(r.expiresAt) })),
            [["sandboxId", "ID"], ["name", "NAME"], ["template", "TEMPLATE"], ["status", "STATUS"], ["expires", "EXPIRES"]],
            t("No sandboxes. Create one: easybits sandboxes create --template node", "No hay sandboxes. Crea uno: easybits sandboxes create --template node"),
          ),
        );
      },
    },
    create: {
      aliases: ["new"],
      summary: "Create a sandbox and wait until it is running",
      usage: "easybits sandboxes create [--template ubuntu] [--name <name>] [--ttl <s>] [--size s|m|l|xl] [--dotenv <path>] [--env K=V]...",
      options: {
        template: { type: "string", value: "name", description: "Base template (default ubuntu): ubuntu, python, node, code-interpreter…" },
        name: { type: "string", value: "name", description: "Human label (lets you `ssh <name>.ghosty`)" },
        ttl: { type: "string", value: "seconds", description: "Time to live before auto-destroy (was --timeout)" },
        size: { type: "string", value: "s|m|l|xl", description: "VM size class (gated by plan)" },
        env: { type: "string", multiple: true, value: "K=V", description: "Environment variable, non-secret (repeatable)" },
        ...ENV_FILE_OPTION,
        "no-wait": { type: "boolean", description: "Return right away instead of waiting for running" },
      },
      examples: [
        "easybits sandboxes create --template node --name scratch",
        "ID=$(easybits sb create --template python --json | jq -r .sandboxId)",
        "easybits sb create --template node --dotenv .env",
      ],
      async run(ctx) {
        const size = str(ctx, "size");
        if (size && !["s", "m", "l", "xl"].includes(size)) throw usageError(t("--size must be s, m, l or xl.", "--size debe ser s, m, l o xl."), this.usage);
        const env = await envFrom(ctx, this.usage);
        const eb = await getClient(ctx);
        const sb = await eb.sandboxes.create({
          template: str(ctx, "template") ?? "ubuntu",
          name: str(ctx, "name"),
          timeoutSeconds: int(ctx, "ttl", this.usage),
          size: size as "s" | "m" | "l" | "xl" | undefined,
          env: Object.keys(env).length ? env : undefined,
          waitForReady: !bool(ctx, "no-wait"),
        });
        const rec = sandboxRecord(sb);
        emit(ctx, rec, () => printSandbox(rec));
      },
    },
    get: {
      aliases: ["show", "status"],
      summary: "Show one sandbox",
      usage: "easybits sandboxes get <sandbox>",
      examples: ["easybits sandboxes get sb_abc123"],
      async run(ctx) {
        const rec = sandboxRecord(await sandbox(ctx, this.usage));
        emit(ctx, rec, () => printSandbox(rec));
      },
    },
    exec: {
      summary: "Run a shell command inside a sandbox",
      usage: "easybits sandboxes exec <sandbox> [--cwd <dir>] [--timeout <s>] [--dotenv <path>] -- <command...>",
      options: {
        cwd: { type: "string", value: "dir", description: "Working directory" },
        timeout: { type: "string", value: "seconds", description: "Kill the command after this long" },
        env: { type: "string", multiple: true, value: "K=V", description: "Environment variable, non-secret (repeatable)" },
        ...ENV_FILE_OPTION,
      },
      examples: [
        "easybits sandboxes exec sb_abc123 -- uname -a",
        "easybits sb exec sb_abc123 --dotenv .env -- node migrate.js",
        "easybits sb exec sb_abc123 --cwd /data/work -- npm test",
        "easybits sb exec sb_abc123 --json -- 'ls -la /' | jq .exitCode",
      ],
      async run(ctx) {
        need(ctx, 0, "sandbox", this.usage);
        const command = ctx.args.slice(1).join(" ");
        if (!command) throw usageError(t("Missing <command>.", "Falta <command>."), this.usage);
        const env = await envFrom(ctx, this.usage);
        const sb = await sandbox(ctx, this.usage);
        const r = await sb.exec(command, {
          cwd: str(ctx, "cwd"),
          timeoutSeconds: int(ctx, "timeout", this.usage),
          env: Object.keys(env).length ? env : undefined,
        });
        if (ctx.json) {
          emit(ctx, r, () => {});
          return;
        }
        // Como `ssh`/`docker exec`: la salida tal cual y el código de salida del comando.
        if (r.stdout) process.stdout.write(r.stdout);
        if (r.stderr) process.stderr.write(r.stderr);
        if (r.truncated) console.error(t("easybits: output truncated", "easybits: salida recortada"));
        process.exitCode = r.exitCode;
      },
    },
    logs: {
      summary: "Read the sandbox journal (optionally one systemd unit)",
      usage: "easybits sandboxes logs <sandbox> [--unit <unit>] [--lines <n>] [--since <spec>] [--grep <text>]",
      options: {
        unit: { type: "string", value: "unit", description: "systemd unit to filter" },
        lines: { type: "string", value: "n", description: "Last N lines (default 200)" },
        since: { type: "string", value: "spec", description: 'journalctl time spec, e.g. "10 min ago"' },
        grep: { type: "string", value: "text", description: "Only lines matching" },
      },
      examples: ["easybits sandboxes logs sb_abc123 --lines 50", "easybits sb logs sb_abc123 --unit myapp --since '10 min ago'"],
      async run(ctx) {
        const sb = await sandbox(ctx, this.usage);
        const r = await sb.logs({
          unit: str(ctx, "unit"),
          lines: int(ctx, "lines", this.usage),
          since: str(ctx, "since"),
          grep: str(ctx, "grep"),
        });
        emit(ctx, r, () => process.stdout.write(r.output.endsWith("\n") || !r.output ? r.output : r.output + "\n"));
      },
    },
    files: {
      summary: "List, read, write, delete, move files and make folders inside a sandbox",
      usage: FILES_USAGE,
      options: {
        content: { type: "string", value: "text", description: "write: inline content instead of a local file" },
        out: { type: "string", value: "file", description: "read: save to a local file (binary-safe)" },
        recursive: { type: "boolean", short: "r", description: "rm: a folder and everything in it" },
        ...YES_OPTION,
      },
      examples: [
        "easybits sandboxes files ls sb_abc123 /data/work",
        "easybits sb files read sb_abc123 /etc/os-release",
        "easybits sb files read sb_abc123 /data/out.png --out out.png",
        "easybits sb files write sb_abc123 /data/work/app.js ./app.js",
        "echo hello | easybits sb files write sb_abc123 /tmp/hello.txt",
        "easybits sb files mkdir sb_abc123 /data/work/out",
        "easybits sb files mv sb_abc123 /data/work/a.txt /data/work/out/a.txt",
        "easybits sb files rm sb_abc123 /data/work/tmp -r --yes",
      ],
      async run(ctx) {
        const action = need(ctx, 0, "ls|read|write|rm|mv|mkdir", FILES_USAGE);
        // Falla antes de pedir credenciales o tocar la red (exit 2 siempre igual).
        if (action === "rm" || action === "delete") requireYesIfHeadless(ctx);
        const id = need(ctx, 1, "sandbox", FILES_USAGE);
        const path = need(ctx, 2, "path", FILES_USAGE);
        const eb = await getClient(ctx);
        const sb = await eb.sandboxes.get(id);
        if (action === "ls" || action === "list") {
          const { entries } = await sb.files.list(path);
          emit(ctx, entries, () =>
            table(
              entries.map((e) => ({ ...e, size: e.isDir ? "dir" : fmtBytes(e.size), modifiedAt: fmtDate(e.modifiedAt) })),
              [["name", "NAME"], ["size", "SIZE"], ["modifiedAt", "MODIFIED"]],
              "Empty directory.",
            ),
          );
        } else if (action === "read" || action === "cat") {
          const out = str(ctx, "out");
          if (out) {
            // base64 para no corromper binarios en el camino.
            const r = await sb.files.read(path, { encoding: "base64" });
            checkNotTruncated(r.size, path);
            writeFileSync(out, Buffer.from(r.content, "base64"));
            emit(ctx, { path, out, size: r.size }, () => console.error(t(`Saved ${fmtBytes(r.size)} to ${out}`, `Guardé ${fmtBytes(r.size)} en ${out}`)));
          } else {
            const r = await sb.files.read(path);
            checkNotTruncated(r.size, path);
            emit(ctx, r, () => process.stdout.write(r.content));
          }
        } else if (action === "write") {
          const local = ctx.args[3];
          const inline = str(ctx, "content");
          let buf: Buffer;
          if (inline != null) buf = Buffer.from(inline, "utf8");
          else if (local) {
            if (!existsSync(local)) throw usageError(t(`File not found: ${local}`, `No existe el archivo: ${local}`), FILES_USAGE);
            buf = readFileSync(local);
          } else if (!process.stdin.isTTY) buf = await readStdin();
          else throw usageError(t("Give a local file, --content, or pipe data on stdin.", "Pasa un archivo local, --content, o datos por stdin."), FILES_USAGE);
          const r = await sb.files.write(path, buf.toString("base64"), { encoding: "base64" });
          emit(ctx, { path, ...r }, () => console.log(t(`Wrote ${fmtBytes(r.bytes)} to ${path}`, `Escribí ${fmtBytes(r.bytes)} en ${path}`)));
        } else if (action === "rm" || action === "delete") {
          const recursive = bool(ctx, "recursive");
          await confirm(ctx, t(`Delete ${path}${recursive ? " and everything in it" : ""} in ${id}?`, `¿Borrar ${path}${recursive ? " y todo lo que tiene" : ""} en ${id}?`));
          const r = await sb.files.delete(path, recursive ? { recursive } : undefined);
          emit(ctx, { path, ...r }, () => console.log(t(`Deleted ${path}`, `Borrado ${path}`)));
        } else if (action === "mv" || action === "move") {
          const to = need(ctx, 3, "new-path", FILES_USAGE);
          const r = await sb.files.move(path, to);
          emit(ctx, { from: path, to, ...r }, () => console.log(`${path} → ${to}`));
        } else if (action === "mkdir") {
          const r = await sb.files.mkdir(path);
          emit(ctx, { path, ...r }, () => console.log(t(`Created ${path}`, `Creada ${path}`)));
        } else {
          throw usageError(t(`Unknown files action "${action}".`, `Acción de files desconocida "${action}".`), FILES_USAGE);
        }
      },
    },
    domains: sandboxDomains,
    suspend: {
      summary: "Suspend to disk (frees CPU; TTL paused)",
      usage: "easybits sandboxes suspend <sandbox>",
      examples: ["easybits sandboxes suspend sb_abc123"],
      async run(ctx) {
        const r = await (await sandbox(ctx, this.usage)).suspend();
        emit(ctx, r, () => console.log(t(`Suspended ${r.sandboxId ?? ctx.args[0]} (${r.status ?? "suspended"})`, `Suspendido ${r.sandboxId ?? ctx.args[0]} (${r.status ?? "suspended"})`)));
      },
    },
    resume: {
      summary: "Wake a suspended sandbox",
      usage: "easybits sandboxes resume <sandbox> [--dotenv <path>] [--env K=V]...",
      options: {
        env: { type: "string", multiple: true, value: "K=V", description: "Rewrite env on wake, non-secret (repeatable)" },
        ...ENV_FILE_OPTION,
      },
      examples: ["easybits sandboxes resume sb_abc123"],
      async run(ctx) {
        const env = await envFrom(ctx, this.usage);
        const r = await (await sandbox(ctx, this.usage)).resume(Object.keys(env).length ? { env } : {});
        emit(ctx, r, () => console.log(t(`Resumed ${r.sandboxId ?? ctx.args[0]} (${r.status ?? "running"})`, `Despierto ${r.sandboxId ?? ctx.args[0]} (${r.status ?? "running"})`)));
      },
    },
    destroy: {
      aliases: ["rm", "delete"],
      summary: "Destroy a sandbox (irreversible)",
      usage: "easybits sandboxes destroy <sandbox> [--yes]",
      options: { ...YES_OPTION },
      examples: ["easybits sandboxes destroy sb_abc123", "easybits sb rm sb_abc123 --yes"],
      async run(ctx) {
        need(ctx, 0, "sandbox", this.usage);
        requireYesIfHeadless(ctx);
        const sb = await sandbox(ctx, this.usage);
        // Una permanente guarda datos y cobra por mes: se teclea el id (patrón de
        // `gh repo delete`); una efímera, [y/N] basta (clig.dev).
        await confirm(
          ctx,
          sb.persistent
            ? t(`Destroy permanent sandbox ${sb.sandboxId}${sb.name ? ` (${sb.name})` : ""} and its disk?`, `¿Destruir el sandbox permanente ${sb.sandboxId}${sb.name ? ` (${sb.name})` : ""} y su disco?`)
            : t(`Destroy sandbox ${sb.sandboxId}?`, `¿Destruir el sandbox ${sb.sandboxId}?`),
          sb.persistent ? { typeName: sb.sandboxId } : {},
        );
        const r = await sb.destroy();
        emit(ctx, { ...r, sandboxId: ctx.args[0] }, () => console.log(t(`Destroyed ${ctx.args[0]}`, `Destruido ${ctx.args[0]}`)));
      },
    },
    bg: {
      summary: "Long-running processes: start one in the background, list, poll its output, kill it",
      usage: BG_USAGE,
      options: {
        cwd: { type: "string", value: "dir", description: "Working directory" },
        env: { type: "string", multiple: true, value: "K=V", description: "Environment variable, non-secret (repeatable)" },
        ...ENV_FILE_OPTION,
        grace: { type: "string", value: "seconds", description: "kill: seconds between SIGTERM and SIGKILL (default 5)" },
      },
      examples: [
        "easybits sb bg start sb_abc123 --cwd /data/work -- npm run dev",
        "easybits sb bg ls sb_abc123",
        "easybits sb bg status sb_abc123 exec_123      # status, exit code, stdout/stderr",
        "easybits sb bg kill sb_abc123 exec_123",
      ],
      async run(ctx) {
        const action = need(ctx, 0, "start|ls|status|kill", BG_USAGE);
        need(ctx, 1, "sandbox", BG_USAGE);
        if (action === "start") {
          const command = ctx.args.slice(2).join(" ");
          if (!command) throw usageError(t("Missing <command> after --.", "Falta <command> después de --."), BG_USAGE);
          const env = await envFrom(ctx, BG_USAGE);
          const sb = await sandboxAt(ctx, 1, BG_USAGE);
          const r = await sb.execBackground(command, { cwd: str(ctx, "cwd"), env: Object.keys(env).length ? env : undefined });
          emit(ctx, r, () => {
            console.log(t(`Started ${r.execId} (${r.status})`, `Arrancó ${r.execId} (${r.status})`));
            console.log(t(`Poll it: easybits sb bg status ${ctx.args[1]} ${r.execId}`, `Revísalo: easybits sb bg status ${ctx.args[1]} ${r.execId}`));
          });
        } else if (action === "ls" || action === "list") {
          const r = await (await sandboxAt(ctx, 1, BG_USAGE)).bgList();
          emit(ctx, r, () =>
            table(
              r.processes.map((p) => ({ ...p, startedAt: fmtDate(p.startedAt), exit: p.exitCode ?? "-", output: fmtBytes(p.stdoutBytes + p.stderrBytes) })),
              [["execId", "ID"], ["status", "STATUS"], ["exit", "EXIT"], ["startedAt", "STARTED"], ["output", "OUTPUT"], ["command", "COMMAND"]],
              t("No background processes.", "Sin procesos en segundo plano."),
            ),
          );
        } else if (action === "status") {
          const execId = need(ctx, 2, "exec-id", BG_USAGE);
          const r = await (await sandboxAt(ctx, 1, BG_USAGE)).bgStatus(execId);
          if (ctx.json) return emit(ctx, r, () => {});
          console.error(`${execId}: ${r.status}${r.exitCode != null ? ` (exit ${r.exitCode})` : ""}${r.logsExpired ? t(" — logs expired", " — logs vencidos") : ""}`);
          if (r.stdout) process.stdout.write(r.stdout);
          if (r.stderr) process.stderr.write(r.stderr);
        } else if (action === "kill") {
          const execId = need(ctx, 2, "exec-id", BG_USAGE);
          const grace = int(ctx, "grace", BG_USAGE);
          const r = await (await sandboxAt(ctx, 1, BG_USAGE)).bgKill(execId, grace != null ? { graceSeconds: grace } : undefined);
          emit(ctx, { execId, ...r }, () =>
            console.log(r.alreadyExited ? t(`${execId} had already exited.`, `${execId} ya había terminado.`) : t(`Killed ${execId} (${r.signal ?? "SIGTERM"})`, `Detenido ${execId} (${r.signal ?? "SIGTERM"})`)),
          );
        } else {
          throw usageError(t(`Unknown bg action "${action}".`, `Acción de bg desconocida "${action}".`), BG_USAGE);
        }
      },
    },
    git: {
      summary: "Git inside a sandbox: clone, status, commit, push, pull, checkout, log",
      usage: GIT_USAGE,
      options: {
        dir: { type: "string", value: "dir", description: "Repo folder inside the sandbox (required)" },
        repo: { type: "string", value: "url", description: "clone: repo URL (clean; the token goes in --git-token)" },
        branch: { type: "string", value: "name", description: "clone/push/checkout: branch" },
        depth: { type: "string", value: "n", description: "clone: shallow depth (default 1)" },
        sha: { type: "string", value: "sha", description: "clone: a specific commit (full clone, detached HEAD)" },
        "git-token": { type: "string", value: "$secret:NAME", description: "Token for a private repo; best as $secret:NAME from your vault" },
        "git-user": { type: "string", value: "name", description: "Username for the token (default: x-access-token)" },
        message: { type: "string", short: "m", value: "text", description: "commit: message" },
        all: { type: "boolean", description: "commit: stage everything first (git add -A)" },
        path: { type: "string", multiple: true, value: "path", description: "commit: only these paths (repeatable); log: only this path" },
        "author-name": { type: "string", value: "name", description: "commit: author name" },
        "author-email": { type: "string", value: "email", description: "commit: author email" },
        remote: { type: "string", value: "name", description: "push: remote (default origin)" },
        "set-upstream": { type: "boolean", description: "push: set the upstream branch" },
        force: { type: "boolean", description: "push: --force-with-lease (fails if the remote moved)" },
        rebase: { type: "boolean", description: "pull: rebase instead of merge" },
        create: { type: "boolean", description: "checkout: create the branch (-B, safe to repeat)" },
        from: { type: "string", value: "ref", description: "checkout --create: start point" },
        limit: { type: "string", value: "n", description: "log: how many" },
      },
      examples: [
        "easybits sb git clone sb_abc123 --repo https://github.com/you/app.git --dir /data/work/app --git-token '$secret:GITHUB_TOKEN'",
        "easybits sb git status sb_abc123 --dir /data/work/app",
        'easybits sb git commit sb_abc123 --dir /data/work/app --all -m "fix: checkout"',
        "easybits sb git push sb_abc123 --dir /data/work/app --git-token '$secret:GITHUB_TOKEN'",
        "easybits sb git checkout sb_abc123 --dir /data/work/app --branch feature/x --create",
        "easybits sb git log sb_abc123 --dir /data/work/app --limit 5",
      ],
      async run(ctx) {
        const op = need(ctx, 0, GIT_OPS.join("|"), GIT_USAGE);
        need(ctx, 1, "sandbox", GIT_USAGE);
        const params = gitParams(op, {
          dir: str(ctx, "dir"),
          repo: str(ctx, "repo"),
          branch: str(ctx, "branch"),
          depth: int(ctx, "depth", GIT_USAGE),
          sha: str(ctx, "sha"),
          token: str(ctx, "git-token"),
          username: str(ctx, "git-user"),
          message: str(ctx, "message"),
          all: bool(ctx, "all"),
          paths: list(ctx, "path"),
          authorName: str(ctx, "author-name"),
          authorEmail: str(ctx, "author-email"),
          remote: str(ctx, "remote"),
          setUpstream: bool(ctx, "set-upstream"),
          force: bool(ctx, "force"),
          rebase: bool(ctx, "rebase"),
          create: bool(ctx, "create"),
          from: str(ctx, "from"),
          limit: int(ctx, "limit", GIT_USAGE),
        });
        const { git } = await sandboxAt(ctx, 1, GIT_USAGE);
        // status recibe la carpeta; las demás, el objeto de parámetros.
        const r: any = op === "status" ? await git.status(params.dir as string) : await (git as any)[op](params);
        emit(ctx, r, () => printGit(op, r));
        // Un pull con conflictos no es error de la API, pero un script debe notarlo.
        if (op === "pull" && r.conflicts?.length) process.exitCode = 1;
      },
    },
    snapshot: {
      summary: "Capture a copy-on-write snapshot without stopping the box",
      usage: "easybits sandboxes snapshot <sandbox> [--name <name>]",
      options: { name: { type: "string", value: "name", description: "Snapshot label" } },
      examples: ["easybits sandboxes snapshot sb_abc123 --name before-upgrade"],
      async run(ctx) {
        const r = await (await sandbox(ctx, this.usage)).snapshot(str(ctx, "name"));
        emit(ctx, r, () => console.log(`Snapshot ${r.snapshotId} (${fmtBytes(r.sizeBytes)})`));
      },
    },
  },
};
