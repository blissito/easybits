import type { Command } from "../types.js";
import { ENV_FILE_OPTION, readEnvFile, readStdin, str } from "../args.js";
import { emit, fmtDate, table } from "../output.js";
import { api } from "../api.js";
import { usageError } from "../errors.js";
import { YES_OPTION, confirm, requireYesIfHeadless } from "../prompt.js";
import { t } from "../i18n.js";

// El vault de la CUENTA (GET/POST/DELETE /api/v2/secrets). Va por api() y no por el SDK
// para que funcione con cualquier SDK 0.36.x instalado (los métodos llegaron en 0.37).

type SecretRow = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

const NAME = /^[A-Z_][A-Z0-9_]*$/;
const SET_USAGE = "easybits secrets set (--dotenv <path|-> | <NAME> < value)";

/**
 * Qué guardar: los pares del dotenv, o un NOMBRE cuyo valor llega por stdin. Un `NOMBRE=valor`
 * en argv se rechaza: ahí lo ven `ps` y el historial (clig.dev). Puro salvo stdin.
 */
export async function secretsToSet(args: string[], dotenv: string | undefined, stdin: () => Promise<string>): Promise<Record<string, string>> {
  if (args.some((a) => a.includes("="))) {
    throw usageError(t("Values never go in argv (ps and shell history see them). Use --dotenv or stdin.", "Los valores nunca van en argv (los ven ps y el historial). Usa --dotenv o stdin."), SET_USAGE);
  }
  if (dotenv && args.length) throw usageError(t("Give --dotenv or a NAME, not both.", "Pasa --dotenv o un NOMBRE, no los dos."), SET_USAGE);
  let values: Record<string, string>;
  if (dotenv) values = await readEnvFile(dotenv, SET_USAGE);
  else if (args.length === 1) {
    // Un salto de línea final (echo, printf con \n) no es parte del secreto.
    const v = (await stdin()).replace(/\r?\n$/, "");
    values = { [args[0]]: v };
  } else throw usageError(t("Give --dotenv <path|-> or one NAME with the value on stdin.", "Pasa --dotenv <ruta|-> o un NOMBRE con el valor por stdin."), SET_USAGE);
  for (const [k, v] of Object.entries(values)) {
    if (!NAME.test(k)) throw usageError(t(`Bad name "${k}": use [A-Z_][A-Z0-9_]* (e.g. GITHUB_TOKEN).`, `Nombre inválido "${k}": usa [A-Z_][A-Z0-9_]* (p. ej. GITHUB_TOKEN).`), SET_USAGE);
    if (!v) throw usageError(t(`Empty value for ${k}.`, `Valor vacío para ${k}.`), SET_USAGE);
  }
  if (!Object.keys(values).length) throw usageError(t("Nothing to save.", "Nada que guardar."), SET_USAGE);
  return values;
}

export const secrets: Command = {
  name: "secrets",
  aliases: ["secret"],
  group: "Account",
  summary: "Your account's secrets vault: names only; used as $secret:NAME",
  synopsis: "secrets <ls|set|rm>",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List the names in your vault (values never come back)",
      usage: "easybits secrets ls",
      examples: ["easybits secrets ls", "easybits secrets ls --json"],
      async run(ctx) {
        const { items } = await api<{ items: SecretRow[] }>(ctx, "GET", "/secrets");
        emit(ctx, { items }, () =>
          table(
            items.map((s) => ({ ...s, createdAt: fmtDate(s.createdAt), lastUsedAt: fmtDate(s.lastUsedAt) })),
            [["name", "NAME"], ["createdAt", "CREATED"], ["lastUsedAt", "LAST USED"]],
            t("No secrets yet. Save one: easybits secrets set --dotenv .env", "Todavía no hay secretos. Guarda uno: easybits secrets set --dotenv .env"),
          ),
        );
      },
    },
    set: {
      summary: "Save or replace secrets from a dotenv file, or one value from stdin",
      usage: SET_USAGE,
      options: { ...ENV_FILE_OPTION },
      examples: [
        "easybits secrets set --dotenv .env.production",
        "printf '%s' \"$TOKEN\" | easybits secrets set GITHUB_TOKEN",
        "op read op://vault/stripe/key | easybits secrets set STRIPE_SECRET_KEY   # from a password manager",
      ],
      async run(ctx) {
        if (ctx.args.length === 1 && !str(ctx, "dotenv") && process.stdin.isTTY) {
          throw usageError(t(`Pipe the value on stdin: printf '%s' "$VALUE" | easybits secrets set ${ctx.args[0]}`, `Pasa el valor por stdin: printf '%s' "$VALOR" | easybits secrets set ${ctx.args[0]}`), SET_USAGE);
        }
        const values = await secretsToSet(ctx.args, str(ctx, "dotenv"), async () => (await readStdin()).toString("utf8"));
        // Uno por uno: el endpoint guarda de a uno y así un nombre inválido no tumba a los demás a medias.
        for (const [name, value] of Object.entries(values)) await api(ctx, "POST", "/secrets", { name, value });
        const saved = Object.keys(values);
        emit(ctx, { saved }, () => console.log(t(`Saved ${saved.join(", ")}. Use it as $secret:${saved[0]}`, `Guardado ${saved.join(", ")}. Úsalo como $secret:${saved[0]}`)));
      },
    },
    rm: {
      aliases: ["remove", "delete"],
      summary: "Delete secrets by name; whatever references them stops resolving",
      usage: "easybits secrets rm <NAME>... [--yes]",
      options: { ...YES_OPTION },
      examples: ["easybits secrets rm GITHUB_TOKEN", "easybits secrets rm OLD_A OLD_B --yes --json"],
      async run(ctx) {
        if (!ctx.args.length) throw usageError(t("Missing <NAME>.", "Falta <NAME>."), this.usage);
        requireYesIfHeadless(ctx);
        await confirm(ctx, t(`Delete ${ctx.args.join(", ")} from your vault? The value cannot be recovered.`, `¿Borrar ${ctx.args.join(", ")} de tu bóveda? El valor no se puede recuperar.`));
        const deleted: string[] = [];
        for (const name of ctx.args) {
          await api(ctx, "DELETE", `/secrets/${encodeURIComponent(name)}`);
          deleted.push(name);
        }
        emit(ctx, { deleted }, () => console.log(t(`Deleted ${deleted.join(", ")}`, `Borrado ${deleted.join(", ")}`)));
      },
    },
  },
  defaultSub: "ls",
};
