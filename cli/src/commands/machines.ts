import type { Command } from "../types.js";
import { int, need, pairs, str } from "../args.js";
import { emit, fmtBytes, fmtDate, table } from "../output.js";
import { getClient } from "../client.js";
import { usageError } from "../errors.js";
import { sandboxRecord } from "./sandboxes.js";

const SECRETS_USAGE = "easybits machines secrets <ls|set|unset> <machine-id> [KEY=VALUE... | NAME]";

export const machines: Command = {
  name: "machines",
  aliases: ["deploy", "machine"],
  group: "Hosting",
  summary: "Permanent machines and their releases (alias: deploy)",
  synopsis: "machines",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List your permanent machines",
      usage: "easybits machines ls",
      examples: ["easybits machines ls", "easybits deploy ls --json"],
      async run(ctx) {
        const eb = await getClient(ctx);
        const rows = (await eb.machines.list()).map(sandboxRecord);
        emit(ctx, rows, () =>
          table(
            rows,
            [["sandboxId", "ID"], ["name", "NAME"], ["tier", "TIER"], ["status", "STATUS"], ["monthlyMxn", "MXN/MONTH"]],
            "No permanent machines. See: easybits docs hosting",
          ),
        );
      },
    },
    deploy: {
      aliases: ["release"],
      summary: "Publish the machine's current app code as a new release",
      usage: "easybits machines deploy <machine-id> [--message <text>]",
      options: { message: { type: "string", short: "m", value: "text", description: "Release note" } },
      examples: ['easybits machines deploy sb_abc123 -m "v1.2: fix checkout"'],
      async run(ctx) {
        const id = need(ctx, 0, "machine-id", this.usage);
        const eb = await getClient(ctx);
        const r = await eb.machines.deploy(id, { message: str(ctx, "message") });
        emit(ctx, r, () => console.log(`Release v${r.version} ${r.releaseId} (${r.status}, ${fmtBytes(r.sizeBytes)})`));
      },
    },
    releases: {
      summary: "List releases, newest first",
      usage: "easybits machines releases <machine-id> [--limit <n>]",
      options: { limit: { type: "string", value: "n", description: "How many" } },
      examples: ["easybits machines releases sb_abc123 --limit 5"],
      async run(ctx) {
        const id = need(ctx, 0, "machine-id", this.usage);
        const eb = await getClient(ctx);
        const r = await eb.machines.releases(id, { limit: int(ctx, "limit", this.usage) });
        emit(ctx, r, () =>
          table(
            r.items.map((x) => ({ ...x, size: fmtBytes(x.sizeBytes), createdAt: fmtDate(x.createdAt) })),
            [["version", "VERSION"], ["releaseId", "ID"], ["status", "STATUS"], ["size", "SIZE"], ["createdAt", "CREATED"], ["message", "MESSAGE"]],
            "No releases yet. Publish one: easybits machines deploy <machine-id>",
          ),
        );
      },
    },
    logs: {
      summary: "Tail the app's own log",
      usage: "easybits machines logs <machine-id> [--lines <n>] [--grep <text>]",
      options: {
        lines: { type: "string", value: "n", description: "Last N lines" },
        grep: { type: "string", value: "text", description: "Only lines matching" },
      },
      examples: ["easybits machines logs sb_abc123 --lines 100", "easybits machines logs sb_abc123 --grep ERROR"],
      async run(ctx) {
        const id = need(ctx, 0, "machine-id", this.usage);
        const eb = await getClient(ctx);
        const r = await eb.machines.logs(id, { lines: int(ctx, "lines", this.usage), grep: str(ctx, "grep") });
        emit(ctx, r, () => process.stdout.write(r.output.endsWith("\n") || !r.output ? r.output : r.output + "\n"));
      },
    },
    rollback: {
      summary: "Put a previous release back on the same machine (data untouched)",
      usage: "easybits machines rollback <machine-id> <release-id>",
      examples: ["easybits machines rollback sb_abc123 rel_789"],
      async run(ctx) {
        const id = need(ctx, 0, "machine-id", this.usage);
        const rel = need(ctx, 1, "release-id", this.usage);
        const eb = await getClient(ctx);
        const r = await eb.machines.rollback(id, rel);
        emit(ctx, r, () => console.log(`Rolled back to v${r.version} (exit ${r.exitCode})`));
        if (r.exitCode !== 0) process.exitCode = 1;
      },
    },
    secrets: {
      summary: "App env vars stored encrypted in your vault",
      usage: SECRETS_USAGE,
      examples: [
        "easybits machines secrets ls sb_abc123",
        "easybits machines secrets set sb_abc123 DATABASE_URL=postgres://… API_KEY=xyz",
        "easybits machines secrets unset sb_abc123 API_KEY",
      ],
      async run(ctx) {
        const action = need(ctx, 0, "ls|set|unset", SECRETS_USAGE);
        const id = need(ctx, 1, "machine-id", SECRETS_USAGE);
        const eb = await getClient(ctx);
        if (action === "ls" || action === "list") {
          const r = await eb.machines.secrets(id);
          emit(ctx, r, () => {
            console.log(`Injected: ${r.secretNames.length ? r.secretNames.join(", ") : "(none)"}`);
            console.log(`In vault: ${r.inVault.length ? r.inVault.join(", ") : "(none)"}`);
          });
        } else if (action === "set") {
          const values = pairs(ctx.args.slice(2), SECRETS_USAGE);
          if (!Object.keys(values).length) throw usageError("Give at least one KEY=VALUE.", SECRETS_USAGE);
          const r = await eb.machines.setSecrets(id, values);
          emit(ctx, r, () => console.log(`Set ${Object.keys(values).join(", ")}. Injected now: ${r.secretNames.join(", ")}`));
        } else if (action === "unset") {
          const name = need(ctx, 2, "NAME", SECRETS_USAGE);
          const r = await eb.machines.unsetSecret(id, name);
          emit(ctx, r, () => console.log(`Unset ${name} (value kept in the vault)`));
        } else {
          throw usageError(`Unknown secrets action "${action}".`, SECRETS_USAGE);
        }
      },
    },
  },
};
