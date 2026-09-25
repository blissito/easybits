import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Sandbox } from "@easybits.cloud/sdk";
import type { Command, Ctx } from "../types.js";
import { bool, int, list, need, pairs, readStdin, str } from "../args.js";
import { emit, fmtBytes, fmtDate, table } from "../output.js";
import { getClient } from "../client.js";
import { usageError } from "../errors.js";

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
  if (s.name) console.log(`Name:      ${s.name}`);
  console.log(`Template:  ${s.template}`);
  console.log(`Status:    ${s.status}`);
  // Mientras hay un snapshot/fork en curso la caja contesta 409 SandboxBusy a todo lo demás.
  if (s.activity) console.log(`Activity:  ${s.activity} (busy: exec/suspend/destroy answer 409 SandboxBusy until it ends)`);
  console.log(`Created:   ${fmtDate(s.createdAt)}`);
  console.log(`Expires:   ${s.persistent ? "never (permanent)" : fmtDate(s.expiresAt)}`);
  if (s.tier) console.log(`Tier:      ${s.tier}${s.monthlyMxn != null ? ` ($${s.monthlyMxn} MXN/month)` : ""}`);
}

async function sandbox(ctx: Ctx, usage: string) {
  const id = need(ctx, 0, "sandbox-id", usage);
  const eb = await getClient(ctx);
  return eb.sandboxes.get(id);
}

const FILES_USAGE = "easybits sandboxes files <ls|read|write> <sandbox-id> <path> [local-file]";

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
            "No sandboxes. Create one: easybits sandboxes create --template node",
          ),
        );
      },
    },
    create: {
      aliases: ["new"],
      summary: "Create a sandbox and wait until it is running",
      usage: "easybits sandboxes create [--template ubuntu] [--name <name>] [--timeout <s>] [--size s|m|l|xl] [--env K=V]...",
      options: {
        template: { type: "string", value: "name", description: "Base template (default ubuntu): ubuntu, python, node, code-interpreter…" },
        name: { type: "string", value: "name", description: "Human label (lets you `ssh <name>.ghosty`)" },
        timeout: { type: "string", value: "seconds", description: "Time to live before auto-destroy" },
        size: { type: "string", value: "s|m|l|xl", description: "VM size class (gated by plan)" },
        env: { type: "string", multiple: true, value: "K=V", description: "Environment variable (repeatable)" },
        "no-wait": { type: "boolean", description: "Return right away instead of waiting for running" },
      },
      examples: [
        "easybits sandboxes create --template node --name scratch",
        "ID=$(easybits sb create --template python --json | jq -r .sandboxId)",
      ],
      async run(ctx) {
        const size = str(ctx, "size");
        if (size && !["s", "m", "l", "xl"].includes(size)) throw usageError("--size must be s, m, l or xl.", this.usage);
        const env = pairs(list(ctx, "env"), this.usage);
        const eb = await getClient(ctx);
        const sb = await eb.sandboxes.create({
          template: str(ctx, "template") ?? "ubuntu",
          name: str(ctx, "name"),
          timeoutSeconds: int(ctx, "timeout", this.usage),
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
      usage: "easybits sandboxes get <sandbox-id>",
      examples: ["easybits sandboxes get sb_abc123"],
      async run(ctx) {
        const rec = sandboxRecord(await sandbox(ctx, this.usage));
        emit(ctx, rec, () => printSandbox(rec));
      },
    },
    exec: {
      summary: "Run a shell command inside a sandbox",
      usage: "easybits sandboxes exec <sandbox-id> [--cwd <dir>] [--timeout <s>] -- <command...>",
      options: {
        cwd: { type: "string", value: "dir", description: "Working directory" },
        timeout: { type: "string", value: "seconds", description: "Kill the command after this long" },
        env: { type: "string", multiple: true, value: "K=V", description: "Environment variable (repeatable)" },
      },
      examples: [
        "easybits sandboxes exec sb_abc123 -- uname -a",
        "easybits sb exec sb_abc123 --cwd /data/work -- npm test",
        "easybits sb exec sb_abc123 --json -- 'ls -la /' | jq .exitCode",
      ],
      async run(ctx) {
        need(ctx, 0, "sandbox-id", this.usage);
        const command = ctx.args.slice(1).join(" ");
        if (!command) throw usageError("Missing <command>.", this.usage);
        const env = pairs(list(ctx, "env"), this.usage);
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
        if (r.truncated) console.error("easybits: output truncated");
        process.exitCode = r.exitCode;
      },
    },
    logs: {
      summary: "Read the sandbox journal (optionally one systemd unit)",
      usage: "easybits sandboxes logs <sandbox-id> [--unit <unit>] [--lines <n>] [--since <spec>] [--grep <text>]",
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
      summary: "List, read or write files inside a sandbox",
      usage: FILES_USAGE,
      options: {
        content: { type: "string", value: "text", description: "write: inline content instead of a local file" },
        out: { type: "string", value: "file", description: "read: save to a local file (binary-safe)" },
      },
      examples: [
        "easybits sandboxes files ls sb_abc123 /data/work",
        "easybits sb files read sb_abc123 /etc/os-release",
        "easybits sb files read sb_abc123 /data/out.png --out out.png",
        "easybits sb files write sb_abc123 /data/work/app.js ./app.js",
        "echo hello | easybits sb files write sb_abc123 /tmp/hello.txt",
      ],
      async run(ctx) {
        const action = need(ctx, 0, "ls|read|write", FILES_USAGE);
        const id = need(ctx, 1, "sandbox-id", FILES_USAGE);
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
            writeFileSync(out, Buffer.from(r.content, "base64"));
            emit(ctx, { path, out, size: r.size }, () => console.error(`Saved ${fmtBytes(r.size)} to ${out}`));
          } else {
            const r = await sb.files.read(path);
            emit(ctx, r, () => process.stdout.write(r.content));
          }
        } else if (action === "write") {
          const local = ctx.args[3];
          const inline = str(ctx, "content");
          let buf: Buffer;
          if (inline != null) buf = Buffer.from(inline, "utf8");
          else if (local) {
            if (!existsSync(local)) throw usageError(`File not found: ${local}`, FILES_USAGE);
            buf = readFileSync(local);
          } else if (!process.stdin.isTTY) buf = await readStdin();
          else throw usageError("Give a local file, --content, or pipe data on stdin.", FILES_USAGE);
          const r = await sb.files.write(path, buf.toString("base64"), { encoding: "base64" });
          emit(ctx, { path, ...r }, () => console.log(`Wrote ${fmtBytes(r.bytes)} to ${path}`));
        } else {
          throw usageError(`Unknown files action "${action}".`, FILES_USAGE);
        }
      },
    },
    suspend: {
      summary: "Suspend to disk (frees CPU; TTL paused)",
      usage: "easybits sandboxes suspend <sandbox-id>",
      examples: ["easybits sandboxes suspend sb_abc123"],
      async run(ctx) {
        const r = await (await sandbox(ctx, this.usage)).suspend();
        emit(ctx, r, () => console.log(`Suspended ${r.sandboxId ?? ctx.args[0]} (${r.status ?? "suspended"})`));
      },
    },
    resume: {
      summary: "Wake a suspended sandbox",
      usage: "easybits sandboxes resume <sandbox-id> [--env K=V]...",
      options: { env: { type: "string", multiple: true, value: "K=V", description: "Rewrite env on wake (repeatable)" } },
      examples: ["easybits sandboxes resume sb_abc123"],
      async run(ctx) {
        const env = pairs(list(ctx, "env"), this.usage);
        const r = await (await sandbox(ctx, this.usage)).resume(Object.keys(env).length ? { env } : {});
        emit(ctx, r, () => console.log(`Resumed ${r.sandboxId ?? ctx.args[0]} (${r.status ?? "running"})`));
      },
    },
    destroy: {
      aliases: ["rm", "delete"],
      summary: "Destroy a sandbox (irreversible)",
      usage: "easybits sandboxes destroy <sandbox-id>",
      examples: ["easybits sandboxes destroy sb_abc123"],
      async run(ctx) {
        const r = await (await sandbox(ctx, this.usage)).destroy();
        emit(ctx, { ...r, sandboxId: ctx.args[0] }, () => console.log(`Destroyed ${ctx.args[0]}`));
      },
    },
    snapshot: {
      summary: "Capture a copy-on-write snapshot without stopping the box",
      usage: "easybits sandboxes snapshot <sandbox-id> [--name <name>]",
      options: { name: { type: "string", value: "name", description: "Snapshot label" } },
      examples: ["easybits sandboxes snapshot sb_abc123 --name before-upgrade"],
      async run(ctx) {
        const r = await (await sandbox(ctx, this.usage)).snapshot(str(ctx, "name"));
        emit(ctx, r, () => console.log(`Snapshot ${r.snapshotId} (${fmtBytes(r.sizeBytes)})`));
      },
    },
  },
};
