import type { Command, Ctx } from "../types.js";
import type { Runspec } from "@easybits.cloud/sdk";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { ENV_FILE_OPTION, bool, int, list, need, pairs, readEnvFile, readStdin, str } from "../args.js";
import { emit, fmtBytes, fmtDate, table } from "../output.js";
import { getClient } from "../client.js";
import { CliError, usageError } from "../errors.js";
import { sandboxRecord } from "./sandboxes.js";
import { resolveRef } from "../resolve.js";
import { api } from "../api.js";
import { YES_OPTION, confirm, requireYesIfHeadless } from "../prompt.js";
import { t } from "../i18n.js";

const SECRETS_USAGE = "easybits machines secrets <ls|set|unset> <machine> [--dotenv <path> | NAME]";
const RUNSPEC_USAGE =
  "easybits machines runspec <get|set> <machine> [--file <file.json|->] [--app-dir <dir>] [--build <cmd>] [--start <cmd>] [--unit <name>] [--port <port>] [--prebuilt on|off] [--data <path>]... [--exclude <path>]... [--env K=V]...";

/** GET /api/v2/machines/:id: la máquina con su tamaño y precio. */
type MachineInfo = {
  sandboxId: string;
  name: string | null;
  status: string;
  tier: string;
  cpuMode: string;
  sleep: boolean;
  diskAddonsGB: number;
  monthlyMxn: number;
  vcpus: number;
  memoryMb: number;
  diskMb: number;
  createdAt: string;
  template: string | null;
  shared: boolean;
  runtimeStatus: string | null;
  deletionScheduledAt: string | null;
};

function printMachine(m: MachineInfo) {
  console.log(`ID:        ${m.sandboxId}`);
  if (m.name) console.log(`${t("Name:     ", "Nombre:   ")} ${m.name}`);
  console.log(`${t("Status:   ", "Estado:   ")} ${m.status}${m.runtimeStatus ? ` (${m.runtimeStatus})` : ""}`);
  console.log(`Tier:      ${m.tier} · ${m.vcpus} vCPU ${m.cpuMode} · ${fmtBytes(m.memoryMb * 1024 * 1024)} RAM · ${fmtBytes(m.diskMb * 1024 * 1024)}${m.diskAddonsGB ? ` + ${m.diskAddonsGB} GB` : ""}`);
  console.log(`${t("Price:    ", "Precio:   ")} $${m.monthlyMxn} MXN/${t("month", "mes")}`);
  console.log(`${t("Sleeps:   ", "Duerme:   ")} ${m.sleep ? t("yes, without visits", "sí, sin visitas") : t("no, always on", "no, siempre prendida")}`);
  console.log(`${t("Created:  ", "Creada:   ")} ${fmtDate(m.createdAt)}`);
  if (m.shared) console.log(t("Shared with you by its owner.", "Su dueño la compartió contigo."));
  if (m.deletionScheduledAt) console.log(t(`Scheduled for deletion: ${fmtDate(m.deletionScheduledAt)}`, `Programada para borrarse: ${fmtDate(m.deletionScheduledAt)}`));
}

function printRunspec(r: Runspec) {
  for (const [k, v] of Object.entries(r)) {
    if (v == null) continue;
    const shown = Array.isArray(v) ? v.join(", ") : typeof v === "object" ? Object.keys(v).join(", ") : String(v);
    console.log(`${k.padEnd(16)}${shown}`);
  }
}

/** El runspec a mezclar: --file primero y las banderas encima (lo explícito gana). Puro salvo la lectura. */
export async function runspecFrom(ctx: Ctx): Promise<Partial<Runspec>> {
  let spec: Record<string, unknown> = {};
  const file = str(ctx, "file");
  if (file) {
    const text = file === "-" ? (await readStdin()).toString("utf8") : existsSync(file) ? readFileSync(file, "utf8") : null;
    if (text == null) throw usageError(t(`File not found: ${file}`, `No existe el archivo: ${file}`), RUNSPEC_USAGE);
    try {
      const parsed = JSON.parse(text);
      // Acepta tal cual la salida de `runspec get --json` ({ runspec: {...} }).
      spec = parsed && typeof parsed === "object" && "runspec" in parsed ? parsed.runspec ?? {} : parsed;
    } catch {
      throw usageError(t(`${file === "-" ? "stdin" : file} is not valid JSON.`, `${file === "-" ? "stdin" : file} no es JSON válido.`), RUNSPEC_USAGE);
    }
  }
  const set = (k: string, v: unknown) => {
    if (v !== undefined) spec[k] = v;
  };
  set("appDir", str(ctx, "app-dir"));
  set("buildCommand", str(ctx, "build"));
  set("startCommand", str(ctx, "start"));
  set("unit", str(ctx, "unit"));
  set("port", int(ctx, "port", RUNSPEC_USAGE));
  const prebuilt = str(ctx, "prebuilt");
  if (prebuilt != null) {
    if (prebuilt !== "on" && prebuilt !== "off") throw usageError(t("--prebuilt is on or off.", "--prebuilt es on u off."), RUNSPEC_USAGE);
    spec.prebuilt = prebuilt === "on";
  }
  const data = list(ctx, "data");
  if (data.length) spec.dataPaths = data;
  const excludes = list(ctx, "exclude");
  if (excludes.length) spec.excludes = excludes;
  const env = pairs(list(ctx, "env"), RUNSPEC_USAGE);
  if (Object.keys(env).length) spec.env = env;
  return spec as Partial<Runspec>;
}

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
        const machineRef = str(ctx, "machine");
        // Con --machine también se puede mandar código nuevo (repo o archive): la máquina es el DESTINO.
        if (!repo && !archiveUrl && !machineRef) {
          throw usageError(t("Give a source: --repo, --archive or --machine.", "Pasa una fuente: --repo, --archive o --machine."), this.usage);
        }
        if (repo && archiveUrl) throw usageError(t("--repo and --archive are exclusive.", "--repo y --archive se excluyen."), this.usage);
        if (machineRef && str(ctx, "tier")) {
          throw usageError(
            t("--tier is only for a new machine. To resize: easybits machines redeploy <machine> --tier <tier> --replace", "--tier sólo aplica a una máquina nueva. Para cambiar tamaño: easybits machines redeploy <máquina> --tier <tier> --replace"),
            this.usage,
          );
        }

        const eb = await getClient(ctx);
        // Nombre o id, como en el resto de los comandos.
        const sandboxId = machineRef ? await resolveRef(ctx, "sandbox", machineRef) : undefined;

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
    get: {
      summary: "Show a machine: tier, size, price, status and whether it sleeps",
      usage: "easybits machines get <machine>",
      examples: ["easybits machines get shop", "easybits machines get shop --json"],
      async run(ctx) {
        const id = need(ctx, 0, "machine", this.usage);
        const m = await api<MachineInfo>(ctx, "GET", `/machines/${encodeURIComponent(id)}`);
        emit(ctx, m, () => printMachine(m));
      },
    },
    adopt: {
      summary: "Register a box that already runs (e.g. migrated by hand) so its secrets live in the vault",
      usage: "easybits machines adopt <sandbox-id> --name <name> [--unit <unit>] [--import-env <path-in-box>] [--tier <tier>] [--dry-run]",
      options: {
        name: { type: "string", value: "name", description: "Label for the machine" },
        unit: { type: "string", value: "unit", description: "systemd unit that `machines restart` restarts" },
        "import-env": { type: "string", value: "path", description: "dotenv file INSIDE the box to copy into the vault (values never leave the server)" },
        tier: { type: "string", value: "tier", description: "Tier to show for it (default: the host's, or mini)" },
        "dry-run": { type: "boolean", description: "Show what would happen without writing anything" },
      },
      examples: [
        "easybits machines adopt sb_abc123 --name shop-prod --unit app --import-env /app/secrets.env --dry-run",
        "easybits machines adopt sb_abc123 --name shop-prod --unit app --import-env /app/secrets.env",
      ],
      async run(ctx) {
        const id = need(ctx, 0, "sandbox-id", this.usage);
        const name = str(ctx, "name");
        if (!name) throw usageError(t("Give --name <name>.", "Pasa --name <nombre>."), this.usage);
        const dryRun = bool(ctx, "dry-run");
        const r = await api<{ dryRun: boolean; sandboxId: string; name: string; tier: string; unit?: string; imported: string[] }>(
          ctx,
          "POST",
          "/machines/adopt",
          { sandboxId: id, name, unit: str(ctx, "unit"), importEnvFrom: str(ctx, "import-env"), tier: str(ctx, "tier"), dryRun },
        );
        emit(ctx, r, () => {
          console.log(
            r.dryRun
              ? t(`Would adopt ${r.sandboxId} as ${r.name} (${r.tier}). Nothing was written.`, `Adoptaría ${r.sandboxId} como ${r.name} (${r.tier}). No se escribió nada.`)
              : t(`Adopted ${r.sandboxId} as ${r.name}. EasyBits keeps its secrets and restarts it; it never redeploys or releases it.`, `Adoptada ${r.sandboxId} como ${r.name}. EasyBits guarda sus secretos y la reinicia; nunca la redespliega ni la libera.`),
          );
          if (r.imported.length) console.log(`${t("Secrets", "Secretos")}: ${r.imported.join(", ")}`);
        });
      },
    },
    restart: {
      summary: "Restart the app's process with the current secrets and runspec (seconds, no build)",
      usage: "easybits machines restart <machine>",
      examples: ["easybits machines restart shop", "easybits machines secrets set shop --dotenv .env && easybits machines restart shop"],
      async run(ctx) {
        const id = need(ctx, 0, "machine", this.usage);
        const r = await api<{ ok: boolean; restarted: boolean; startOutput?: string; exitCode: number }>(ctx, "POST", `/machines/${encodeURIComponent(id)}/restart`);
        emit(ctx, r, () => {
          console.log(r.exitCode === 0 ? t(`Restarted ${id}`, `Reiniciada ${id}`) : t(`Restart failed (exit ${r.exitCode})`, `Falló el reinicio (salida ${r.exitCode})`));
          if (r.exitCode !== 0 && r.startOutput) console.log(r.startOutput.slice(-2000));
        });
        if (r.exitCode !== 0) process.exitCode = 1;
      },
    },
    redeploy: {
      summary: "Build a NEW machine from a release: recover a lost one, or change its tier (resize)",
      usage: "easybits machines redeploy <machine> [--release <id>] [--tier <tier>] [--name <name>] [--cpu-mode shared|reserved] [--replace] [--yes]",
      options: {
        release: { type: "string", value: "id", description: "Release to build from (default: the machine's newest)" },
        tier: { type: "string", value: "tier", description: "Size of the new machine (default: same as the release's)" },
        name: { type: "string", value: "name", description: "Label for the new machine" },
        "cpu-mode": { type: "string", value: "mode", description: "shared (default) or reserved" },
        replace: { type: "boolean", description: "Release the old machine once the new one runs (otherwise you pay for both)" },
        ...YES_OPTION,
      },
      examples: [
        "easybits machines redeploy shop --tier focus --replace   # resize",
        "easybits machines redeploy sb_abc123 --release rel_789   # recover from a release",
      ],
      async run(ctx) {
        const id = need(ctx, 0, "machine", this.usage);
        const replace = bool(ctx, "replace");
        if (replace) requireYesIfHeadless(ctx);
        const eb = await getClient(ctx);
        let releaseId = str(ctx, "release");
        if (!releaseId) {
          const { items } = await eb.machines.releases(id, { limit: 1 });
          releaseId = items[0]?.releaseId;
          if (!releaseId) throw new CliError(t(`${id} has no releases to build from.`, `${id} no tiene releases de dónde construir.`), 1, t("Publish one first: easybits machines deploy <machine>", "Publica uno antes: easybits machines deploy <máquina>"), "no_release");
        }
        const cpuMode = str(ctx, "cpu-mode");
        if (cpuMode && cpuMode !== "shared" && cpuMode !== "reserved") throw usageError(t("--cpu-mode is shared or reserved.", "--cpu-mode es shared o reserved."), this.usage);
        if (replace) {
          // La nueva nace SIN datos: el disco de la vieja sólo queda en sus respaldos.
          await confirm(
            ctx,
            t(`Build a new machine from ${releaseId} and RELEASE ${id} once it runs? The new one starts with no data (${id}'s data stays in its backups).`, `¿Construir una máquina nueva desde ${releaseId} y LIBERAR ${id} cuando corra? La nueva nace sin datos (los de ${id} quedan en sus respaldos).`),
            { typeName: id },
          );
        }
        const r = await eb.machines.redeploy(releaseId, {
          tier: str(ctx, "tier"),
          name: str(ctx, "name"),
          cpuMode: cpuMode as "shared" | "reserved" | undefined,
          replaceSandboxId: replace ? id : undefined,
        });
        emit(ctx, r, () => {
          console.log(t(`New machine ${r.sandboxId} from ${r.releaseId} (exit ${r.exitCode})`, `Máquina nueva ${r.sandboxId} desde ${r.releaseId} (salida ${r.exitCode})`));
          if (r.replaced) console.log(t(`Released ${r.replaced}.`, `Liberada ${r.replaced}.`));
          console.log(t("It starts with no data: restore a backup if the app keeps any.", "Nace sin datos: restaura un respaldo si la app guarda alguno."));
        });
        if (r.exitCode !== 0) process.exitCode = 1;
      },
    },
    backups: {
      summary: "List the daily data backups, newest first (kept 7 days)",
      usage: "easybits machines backups <machine> [--limit <n>]",
      options: { limit: { type: "string", value: "n", description: "How many" } },
      examples: ["easybits machines backups shop", "easybits machines backups shop --json"],
      async run(ctx) {
        const id = need(ctx, 0, "machine", this.usage);
        const eb = await getClient(ctx);
        const r = await eb.machines.backups(id, { limit: int(ctx, "limit", this.usage) });
        emit(ctx, r, () =>
          table(
            r.items.map((b) => ({ ...b, size: fmtBytes(b.bytes), createdAt: fmtDate(b.createdAt), expiresAt: fmtDate(b.expiresAt) })),
            [["id", "ID"], ["stamp", "DAY"], ["status", "STATUS"], ["size", "SIZE"], ["consistency", "CONSISTENCY"], ["expiresAt", "EXPIRES"]],
            t("No backups yet. Declare what to copy (runspec dataPaths), then: easybits machines backup <machine>", "Todavía no hay respaldos. Declara qué copiar (dataPaths del runspec) y luego: easybits machines backup <máquina>"),
          ),
        );
      },
    },
    backup: {
      summary: "Take a data backup now instead of waiting for tonight's",
      usage: "easybits machines backup <machine>",
      examples: ["easybits machines backup shop"],
      async run(ctx) {
        const id = need(ctx, 0, "machine", this.usage);
        const eb = await getClient(ctx);
        const b = await eb.machines.backup(id);
        emit(ctx, b, () => console.log(t(`Backup ${b.id} (${b.status}, ${fmtBytes(b.bytes)}, ${b.consistency})`, `Respaldo ${b.id} (${b.status}, ${fmtBytes(b.bytes)}, ${b.consistency})`)));
      },
    },
    runspec: {
      summary: "How the app is built, started and backed up (set merges with what is there)",
      usage: RUNSPEC_USAGE,
      options: {
        file: { type: "string", value: "file.json|-", description: "Runspec as JSON (- reads stdin); flags win over it" },
        "app-dir": { type: "string", value: "dir", description: "Where the app lives in the machine" },
        build: { type: "string", value: "cmd", description: "Build command" },
        start: { type: "string", value: "cmd", description: "Start command (used when there is no systemd unit)" },
        unit: { type: "string", value: "name", description: "systemd unit to restart (preferred over --start)" },
        port: { type: "string", value: "port", description: "Port the app listens on" },
        prebuilt: { type: "string", value: "on|off", description: "on: releases ship the build and a deploy only starts it" },
        data: { type: "string", multiple: true, value: "path", description: "Path the nightly backup copies (repeatable). Without it nothing is backed up" },
        exclude: { type: "string", multiple: true, value: "path", description: "Path kept out of the release (repeatable)" },
        env: { type: "string", multiple: true, value: "K=V", description: "Environment variable, non-secret (repeatable)" },
      },
      examples: [
        "easybits machines runspec get shop",
        "easybits machines runspec set shop --data /app/data --data /app/uploads",
        "easybits machines runspec set shop --start 'node server.js' --port 8080 --prebuilt on",
        "easybits machines runspec get shop --json | jq .runspec > rs.json   # edit, then:",
        "easybits machines runspec set shop --file rs.json",
      ],
      async run(ctx) {
        const action = need(ctx, 0, "get|set", RUNSPEC_USAGE);
        const id = need(ctx, 1, "machine", RUNSPEC_USAGE);
        const eb = await getClient(ctx);
        if (action === "get") {
          const r = await eb.machines.runspec(id);
          emit(ctx, r, () => (r.runspec ? printRunspec(r.runspec) : console.log(t("No runspec yet: a machine made with launch has one.", "Todavía sin runspec: una máquina hecha con launch ya lo trae."))));
          return;
        }
        if (action !== "set") throw usageError(t(`Unknown runspec action "${action}".`, `Acción de runspec desconocida "${action}".`), RUNSPEC_USAGE);
        const spec = await runspecFrom(ctx);
        if (!Object.keys(spec).length) throw usageError(t("Nothing to set: pass --file or a flag (--data, --start, --port…).", "Nada que cambiar: pasa --file o una bandera (--data, --start, --port…)."), RUNSPEC_USAGE);
        const r = await eb.machines.setRunspec(id, spec as Runspec);
        emit(ctx, r, () => {
          console.log(t("Runspec saved. It applies on the next deploy or restart.", "Runspec guardado. Aplica en el siguiente deploy o reinicio."));
          printRunspec(r);
        });
      },
    },
    rm: {
      aliases: ["destroy", "delete"],
      summary: "Release a machine: stops billing, takes a last backup and destroys it",
      usage: "easybits machines rm <machine> [--yes]",
      options: { ...YES_OPTION },
      examples: ["easybits machines rm shop", "easybits machines rm sb_abc123 --yes --json"],
      async run(ctx) {
        const id = need(ctx, 0, "machine", this.usage);
        requireYesIfHeadless(ctx);
        await confirm(ctx, t(`Release machine ${id}? Billing stops and the box is destroyed (a last backup is kept).`, `¿Liberar la máquina ${id}? Se deja de cobrar y la caja se destruye (queda un último respaldo).`), { typeName: id });
        const r = await api<{ ok: true; destroyed: true; backupId?: string }>(ctx, "DELETE", `/machines/${encodeURIComponent(id)}`);
        emit(ctx, { ...r, sandboxId: id }, () => {
          console.log(t(`Released ${id}.`, `Liberada ${id}.`));
          console.log(r.backupId ? t(`Last backup: ${r.backupId}`, `Último respaldo: ${r.backupId}`) : t("No final backup (nothing declared in dataPaths, or it failed).", "Sin respaldo final (nada declarado en dataPaths, o falló)."));
        });
      },
    },
    tiers: {
      summary: "The hosting catalog: sizes and monthly prices in MXN",
      usage: "easybits machines tiers",
      examples: ["easybits machines tiers", "easybits machines tiers --json"],
      async run(ctx) {
        const eb = await getClient(ctx);
        const r = await eb.machines.tiers();
        emit(ctx, r, () => {
          table(
            r.tiers.map((x) => ({ ...x, memory: fmtBytes(x.memoryMb * 1024 * 1024), disk: fmtBytes(x.diskMb * 1024 * 1024), reserved: x.priceReserved ?? "-" })),
            [["key", "TIER"], ["vcpus", "VCPUS"], ["memory", "MEMORY"], ["disk", "DISK"], ["priceShared", "MXN/MONTH"], ["reserved", "RESERVED"], ["minPlan", "PLAN"]],
          );
          console.log(t(`Extra disk: ${r.diskAddon.gb} GB for $${r.diskAddon.price} MXN/month each.`, `Disco extra: ${r.diskAddon.gb} GB por $${r.diskAddon.price} MXN/mes cada uno.`));
        });
      },
    },
    secrets: {
      summary: "App env vars stored encrypted in your vault",
      usage: SECRETS_USAGE,
      options: {
        ...ENV_FILE_OPTION,
        "no-restart": { type: "boolean", description: "Store them without restarting the app (apply later with machines restart)" },
      },
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
          const r = bool(ctx, "no-restart")
            ? await api<{ secretNames: string[] }>(ctx, "PUT", `/machines/${encodeURIComponent(id)}/secrets?restart=false`, values)
            : await eb.machines.setSecrets(id, values);
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
