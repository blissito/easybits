import type { Command } from "../types.js";
import { ENV_FILE_OPTION, int, need, pairs, readEnvFile, str } from "../args.js";
import { emit, fmtBytes, fmtDate, table } from "../output.js";
import { getClient } from "../client.js";
import { usageError } from "../errors.js";
import { sandboxRecord } from "./sandboxes.js";
import { t } from "../i18n.js";

const SECRETS_USAGE = "easybits machines secrets <ls|set|unset> <machine> [--dotenv <path> | NAME]";

export const machines: Command = {
  name: "machines",
  aliases: ["machine"],
  group: "Hosting",
  summary: "Permanent machines and their releases (easybits deploy <machine> publishes)",
  synopsis: "machines",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List your permanent machines",
      usage: "easybits machines ls",
      examples: ["easybits machines ls", "easybits machines ls --json"],
      async run(ctx) {
        const eb = await getClient(ctx);
        const rows = (await eb.machines.list()).map(sandboxRecord);
        emit(ctx, rows, () =>
          table(
            rows,
            [["sandboxId", "ID"], ["name", "NAME"], ["tier", "TIER"], ["status", "STATUS"], ["monthlyMxn", "MXN/MONTH"]],
            t("No permanent machines. See: easybits docs hosting", "No hay máquinas permanentes. Mira: easybits docs hosting"),
          ),
        );
      },
    },
    deploy: {
      summary: "Publish the machine's current app code as a new release",
      usage: "easybits machines deploy <machine> [--message <text>]",
      options: { message: { type: "string", short: "m", value: "text", description: "Release note" } },
      examples: ['easybits machines deploy shop -m "v1.2: fix checkout"', 'easybits deploy shop -m "v1.2"          # same thing, shorter'],
      async run(ctx) {
        const id = need(ctx, 0, "machine", this.usage);
        const eb = await getClient(ctx);
        const r = await eb.machines.deploy(id, { message: str(ctx, "message") });
        emit(ctx, r, () => console.log(`Release v${r.version} ${r.releaseId} (${r.status}, ${fmtBytes(r.sizeBytes)})`));
      },
    },
    releases: {
      summary: "List releases, newest first",
      usage: "easybits machines releases <machine> [--limit <n>]",
      options: { limit: { type: "string", value: "n", description: "How many" } },
      examples: ["easybits machines releases sb_abc123 --limit 5"],
      async run(ctx) {
        const id = need(ctx, 0, "machine", this.usage);
        const eb = await getClient(ctx);
        const r = await eb.machines.releases(id, { limit: int(ctx, "limit", this.usage) });
        emit(ctx, r, () =>
          table(
            r.items.map((x) => ({ ...x, size: fmtBytes(x.sizeBytes), createdAt: fmtDate(x.createdAt) })),
            [["version", "VERSION"], ["releaseId", "ID"], ["status", "STATUS"], ["size", "SIZE"], ["createdAt", "CREATED"], ["message", "MESSAGE"]],
            t("No releases yet. Publish one: easybits machines deploy <machine>", "Todavía no hay releases. Publica uno: easybits deploy <máquina>"),
          ),
        );
      },
    },
    logs: {
      summary: "Tail the app's own log",
      usage: "easybits machines logs <machine> [--lines <n>] [--grep <text>]",
      options: {
        lines: { type: "string", value: "n", description: "Last N lines" },
        grep: { type: "string", value: "text", description: "Only lines matching" },
      },
      examples: ["easybits machines logs sb_abc123 --lines 100", "easybits machines logs sb_abc123 --grep ERROR"],
      async run(ctx) {
        const id = need(ctx, 0, "machine", this.usage);
        const eb = await getClient(ctx);
        const r = await eb.machines.logs(id, { lines: int(ctx, "lines", this.usage), grep: str(ctx, "grep") });
        emit(ctx, r, () => process.stdout.write(r.output.endsWith("\n") || !r.output ? r.output : r.output + "\n"));
      },
    },
    rollback: {
      summary: "Put a previous release back on the same machine (data untouched)",
      usage: "easybits machines rollback <machine> <release-id>",
      examples: ["easybits machines rollback sb_abc123 rel_789"],
      async run(ctx) {
        const id = need(ctx, 0, "machine", this.usage);
        const rel = need(ctx, 1, "release-id", this.usage);
        const eb = await getClient(ctx);
        const r = await eb.machines.rollback(id, rel);
        emit(ctx, r, () => console.log(t(`Rolled back to v${r.version} (exit ${r.exitCode})`, `De vuelta en v${r.version} (salida ${r.exitCode})`)));
        if (r.exitCode !== 0) process.exitCode = 1;
      },
    },
    secrets: {
      summary: "App env vars stored encrypted in your vault",
      usage: SECRETS_USAGE,
      options: { ...ENV_FILE_OPTION },
      examples: [
        "easybits machines secrets ls sb_abc123",
        "easybits machines secrets set sb_abc123 --dotenv .env.production",
        "printf 'API_KEY=%s\\n' \"$API_KEY\" | easybits machines secrets set sb_abc123 --dotenv -",
        "easybits machines secrets unset sb_abc123 API_KEY",
      ],
      async run(ctx) {
        const action = need(ctx, 0, "ls|set|unset", SECRETS_USAGE);
        const id = need(ctx, 1, "machine", SECRETS_USAGE);
        const eb = await getClient(ctx);
        if (action === "ls" || action === "list") {
          const r = await eb.machines.secrets(id);
          emit(ctx, r, () => {
            console.log(`${t("Injected", "Inyectados")}: ${r.secretNames.length ? r.secretNames.join(", ") : t("(none)", "(ninguno)")}`);
            console.log(`${t("In vault", "En el vault")}: ${r.inVault.length ? r.inVault.join(", ") : t("(none)", "(ninguno)")}`);
          });
        } else if (action === "set") {
          // KEY=VALUE en argv sigue funcionando (compatibilidad), pero ya no se anuncia:
          // clig.dev «Do not read secrets directly from flags» (gh secret set lee stdin).
          const file = str(ctx, "dotenv");
          const values = { ...(file ? await readEnvFile(file, SECRETS_USAGE) : {}), ...pairs(ctx.args.slice(2), SECRETS_USAGE) };
          if (!Object.keys(values).length) throw usageError(t("Give --dotenv <path> (or - for stdin).", "Pasa --dotenv <ruta> (o - para stdin)."), SECRETS_USAGE);
          const r = await eb.machines.setSecrets(id, values);
          emit(ctx, r, () => console.log(t(`Set ${Object.keys(values).join(", ")}. Injected now: ${r.secretNames.join(", ")}`, `Guardados ${Object.keys(values).join(", ")}. Inyectados ahora: ${r.secretNames.join(", ")}`)));
        } else if (action === "unset") {
          const name = need(ctx, 2, "NAME", SECRETS_USAGE);
          const r = await eb.machines.unsetSecret(id, name);
          emit(ctx, r, () => console.log(t(`Unset ${name} (value kept in the vault)`, `Quitado ${name} (el valor sigue en el vault)`)));
        } else {
          throw usageError(t(`Unknown secrets action "${action}".`, `Acción de secrets desconocida "${action}".`), SECRETS_USAGE);
        }
      },
    },
  },
};
