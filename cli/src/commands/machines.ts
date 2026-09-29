import type { Command } from "../types.js";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { ENV_FILE_OPTION, bool, int, list, need, pairs, readEnvFile, str } from "../args.js";
import { emit, fmtBytes, fmtDate, table } from "../output.js";
import { getClient } from "../client.js";
import { CliError, usageError } from "../errors.js";
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
    launch: {
      aliases: ["create", "new"],
      summary: "Create a machine and put an app on it in one step (or redeploy onto an existing one)",
      usage:
        "easybits machines launch (--repo <url> | --archive <url|file> | --machine <machine>) [--tier micro] [--name <name>] [--prebuilt] [--start <cmd>] [--port 3000] [--env K=V]... [--secret NAME]... [--data <path>]... [--domain <host>]",
      options: {
        repo: { type: "string", value: "url", description: "Git repo to clone (clean URL; a token goes in --repo-token)" },
        branch: { type: "string", value: "name", description: "Branch to clone" },
        "repo-token": { type: "string", value: "$secret:NAME", description: "Token for a private repo; best as $secret:NAME from your vault" },
        archive: { type: "string", value: "url|file", description: "A .tar.gz/.zip of the app: URL, or a local file that gets uploaded first" },
        machine: { type: "string", value: "machine", description: "Deploy onto this existing machine instead of creating one" },
        tier: { type: "string", value: "tier", description: "Size for a new machine: nano, micro (default), estandar, focus, performance…" },
        name: { type: "string", value: "name", description: "Human label" },
        "app-dir": { type: "string", value: "dir", description: "Where the app lives in the machine (default /app)" },
        build: { type: "string", value: "cmd", description: "Build command (default: npm ci && npm run build)" },
        start: { type: "string", value: "cmd", description: "Start command (default: npm start)" },
        port: { type: "string", value: "port", description: "Port the app listens on (default 3000)" },
        prebuilt: { type: "boolean", description: "The code is already built: skip the build, just start it" },
        env: { type: "string", multiple: true, value: "K=V", description: "Environment variable, non-secret (repeatable)" },
        secret: { type: "string", multiple: true, value: "NAME", description: "Vault secret the app needs, by name (repeatable)" },
        data: { type: "string", multiple: true, value: "path", description: "Path the nightly backup copies (repeatable). Without it nothing is backed up" },
        domain: { type: "string", value: "host", description: "Domain to attach; the output says which DNS record to create" },
        message: { type: "string", short: "m", value: "text", description: "Release note" },
      },
      examples: [
        "easybits machines launch --repo https://github.com/you/shop.git --tier micro --domain shop.example.com",
        "easybits machines launch --archive ./build.tgz --prebuilt --tier nano --name shop --start 'npm start'",
        "easybits machines launch --machine shop --archive ./build.tgz --prebuilt -m v2   # redeploy",
      ],
      async run(ctx) {
        const repo = str(ctx, "repo");
        let archiveUrl = str(ctx, "archive");
        const sandboxId = str(ctx, "machine");
        // Con --machine también se puede mandar código nuevo (repo o archive): la máquina es el DESTINO.
        if (!repo && !archiveUrl && !sandboxId) {
          throw usageError(t("Give a source: --repo, --archive or --machine.", "Pasa una fuente: --repo, --archive o --machine."), this.usage);
        }
        if (repo && archiveUrl) throw usageError(t("--repo and --archive are exclusive.", "--repo y --archive se excluyen."), this.usage);
        if (sandboxId && str(ctx, "tier")) {
          throw usageError(t("--tier is only for a new machine (resize = redeploy_machine).", "--tier sólo aplica a una máquina nueva (cambiar tamaño = redeploy_machine)."), this.usage);
        }

        const eb = await getClient(ctx);

        // Un archivo local se sube primero (público y de vida corta: la caja lo baja con curl, sin
        // credenciales). No debe llevar secretos: esos llegan desde el vault, ya dentro de la caja.
        if (archiveUrl && !/^https?:\/\//.test(archiveUrl)) {
          if (!existsSync(archiveUrl)) throw usageError(t(`File not found: ${archiveUrl}`, `No existe el archivo: ${archiveUrl}`), this.usage);
          const size = statSync(archiveUrl).size;
          const contentType = archiveUrl.endsWith(".zip") ? "application/zip" : "application/gzip";
          const up = await eb.uploadFile({ fileName: basename(archiveUrl), contentType, size, access: "public" });
          const res = await fetch(up.putUrl, { method: "PUT", body: readFileSync(archiveUrl), headers: { "Content-Type": contentType } });
          if (!res.ok) throw new CliError(t(`Upload failed: storage answered ${res.status}`, `Falló la subida: el almacenamiento contestó ${res.status}`), 1, undefined, "upload_failed", res.status);
          // El tipo EasybitsFile del SDK aún no declara `url`, pero un archivo público la trae.
          archiveUrl = (up.file as { url?: string }).url;
          if (!archiveUrl) throw new CliError(t("The upload returned no public URL.", "La subida no devolvió una URL pública."), 1, undefined, "upload_failed");
        }

        const env = pairs(list(ctx, "env"), this.usage);
        const secretNames = list(ctx, "secret");
        const dataPaths = list(ctx, "data");
        const r = await eb.machines.launch({
          repo,
          branch: str(ctx, "branch"),
          repoToken: str(ctx, "repo-token"),
          archiveUrl,
          sandboxId,
          tier: str(ctx, "tier"),
          name: str(ctx, "name"),
          appDir: str(ctx, "app-dir"),
          buildCommand: str(ctx, "build"),
          startCommand: str(ctx, "start"),
          port: int(ctx, "port", this.usage),
          prebuilt: bool(ctx, "prebuilt") || undefined,
          env: Object.keys(env).length ? env : undefined,
          secretNames: secretNames.length ? secretNames : undefined,
          dataPaths: dataPaths.length ? dataPaths : undefined,
          domain: str(ctx, "domain"),
          message: str(ctx, "message"),
        });

        if (r.checkoutUrl) {
          emit(ctx, r, () => {
            console.log(t("Your account has no plan: pay the machine here and it is created by itself:", "Tu cuenta no tiene plan: paga la máquina aquí y se crea sola:"));
            console.log(`  ${r.checkoutUrl}`);
            console.log(t("Then deploy onto it: easybits machines launch --machine <id> …", "Luego despliega encima: easybits machines launch --machine <id> …"));
          });
          return;
        }
        if (r.exitCode !== 0) {
          throw new CliError(
            t(`Launch failed (exit ${r.exitCode}) on ${r.sandboxId}`, `Falló el lanzamiento (exit ${r.exitCode}) en ${r.sandboxId}`),
            1,
            r.buildOutput?.slice(-2000),
            "launch_failed",
          );
        }
        emit(ctx, r, () => {
          console.log(`${r.sandboxId}  v${r.version}  ${r.url}`);
          if (r.domain) {
            console.log(`${t("Domain", "Dominio")}: ${r.domain.domain} → ${r.domain.url}`);
            console.log(`DNS: ${JSON.stringify(r.domain.dns)}`);
          }
        });
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
