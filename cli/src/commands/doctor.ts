// `easybits doctor`: ¿la CLI puede trabajar? Node, versión, credencial, API y el rc.
// Sale con 1 si algo falla, para que un agente lo use como compuerta antes de operar.
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveBaseUrl } from "@easybits.cloud/sdk";
import type { Command } from "../types.js";
import { emit } from "../output.js";
import { fetchEmail, readRc } from "../auth.js";
import { resolveCredential } from "../client.js";
import { EXIT, toCliError } from "../errors.js";
import { UPGRADE, fetchLatest, newer, updateCheckDisabled } from "../update.js";
import { t } from "../i18n.js";

declare const __CLI_VERSION__: string;
const VERSION = typeof __CLI_VERSION__ === "string" ? __CLI_VERSION__ : "dev";

type Check = { check: string; ok: boolean; detail: string; hint?: string };

export const doctor: Command = {
  name: "doctor",
  group: "Account",
  summary: "Check the CLI setup: Node, version, credential, API; exits 1 on a problem",
  synopsis: "doctor",
  leaf: {
    summary: "Check Node, the CLI version, your credential and the API; exits 1 on a problem",
    usage: "easybits doctor",
    examples: ["easybits doctor", "easybits doctor --json | jq '.checks[] | select(.ok==false)'", "easybits agents doctor <agent>   # one agent"],
    async run(ctx) {
      const checks: Check[] = [];
      const major = Number(process.versions.node.split(".")[0]);
      checks.push({ check: "node", ok: major >= 22, detail: process.versions.node, ...(major >= 22 ? {} : { hint: t("The CLI needs Node 22 or newer.", "El CLI necesita Node 22 o más nuevo.") }) });

      if (updateCheckDisabled()) checks.push({ check: "version", ok: true, detail: t(`${VERSION} (update check off)`, `${VERSION} (sin revisar versiones)`) });
      else {
        const latest = await fetchLatest(3000);
        const old = latest && VERSION !== "dev" && newer(latest, VERSION);
        checks.push({
          check: "version",
          ok: !old,
          detail: latest ? `${VERSION}${old ? ` (${t("latest", "la más nueva")} ${latest})` : t(" (latest)", " (la más nueva)")}` : t(`${VERSION} (npm unreachable)`, `${VERSION} (npm no contesta)`),
          ...(old ? { hint: `${t("Run", "Corre")}: ${UPGRADE}` } : {}),
        });
      }

      const base = await resolveBaseUrl();
      const health = await fetch(`${base.replace(/\/+$/, "")}/api/health`, { signal: AbortSignal.timeout(5000) })
        .then((r) => ({ ok: r.ok, detail: `${base} (${r.status})` }))
        .catch((e: Error) => ({ ok: false, detail: `${base}: ${e.message}` }));
      checks.push({ check: "api", ...health, ...(health.ok ? {} : { hint: t("Check your network or EASYBITS_URL.", "Revisa tu red o EASYBITS_URL.") }) });

      const rc = readRc();
      const source = process.env.EASYBITS_API_KEY
        ? "env EASYBITS_API_KEY"
        : ctx.token
          ? "--token"
          : rc.oauth?.accessToken
            ? "browser session (~/.easybitsrc)"
            : rc.apiKey
              ? "API key (~/.easybitsrc)"
              : null;
      if (!source) checks.push({ check: "credential", ok: false, detail: t("not logged in", "sin sesión"), hint: t("Run: easybits login   (or set EASYBITS_API_KEY)", "Corre: easybits login   (o define EASYBITS_API_KEY)") });
      else {
        try {
          const email = await fetchEmail(await resolveCredential(ctx));
          checks.push({ check: "credential", ok: true, detail: `${email ?? t("(unknown email)", "(correo desconocido)")} ${t("via", "por")} ${source}` });
        } catch (e) {
          const err = toCliError(e);
          checks.push({ check: "credential", ok: false, detail: `${source}: ${err.message}`, hint: err.hint });
        }
        // Las dos a la vez confunden: el env gana y el rc queda de otra cuenta.
        if (process.env.EASYBITS_API_KEY && (rc.apiKey || rc.oauth)) {
          checks.push({ check: "credential-env", ok: true, detail: t("EASYBITS_API_KEY wins over the saved login in ~/.easybitsrc", "EASYBITS_API_KEY le gana a la sesión guardada en ~/.easybitsrc") });
        }
      }

      const rcPath = join(homedir(), ".easybitsrc");
      if (existsSync(rcPath)) {
        const mode = statSync(rcPath).mode & 0o777;
        const ok = (mode & 0o077) === 0;
        checks.push({ check: "rc-file", ok, detail: `${rcPath} ${mode.toString(8).padStart(3, "0")}`, ...(ok ? {} : { hint: t(`It holds tokens. Run: chmod 600 ${rcPath}`, `Guarda tokens. Corre: chmod 600 ${rcPath}`) }) });
      }

      const ok = checks.every((c) => c.ok);
      emit(ctx, { ok, checks }, () => {
        for (const c of checks) {
          console.log(`${c.ok ? "ok  " : t("FAIL", "MAL ")}  ${c.check.padEnd(14)} ${c.detail}`);
          if (!c.ok && c.hint) console.log(`      ${"".padEnd(14)} → ${c.hint}`);
        }
        console.log(ok ? t("\nAll good.", "\nTodo bien.") : t("\nProblems found.", "\nHay problemas."));
      });
      if (!ok) process.exitCode = EXIT.API;
    },
  },
};
