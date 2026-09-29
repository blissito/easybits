#!/usr/bin/env node
import { parseArgs } from "node:util";
import type { Command, Ctx, Leaf, Options } from "./types.js";
import { COMMANDS, findCommand } from "./commands/index.js";
import { didYouMean } from "./suggest.js";
import { commandHelp, globalHelp, leafHelp } from "./help.js";
import { BANNER } from "./banner.js";
import { EasybitsError } from "@easybits.cloud/sdk";
import { CliError, EXIT, toCliError, usageError } from "./errors.js";
import { forceRefresh, usedSession } from "./client.js";
import { resolveRefs } from "./resolve.js";
import { cachedNewer, updateNotice, UPGRADE } from "./update.js";
import { normalizeArgs } from "./aliases.js";
import { completeCmd } from "./commands/completion.js";
import { detectLang, langFlag, setLang, t } from "./i18n.js";

declare const __CLI_VERSION__: string;
const VERSION = typeof __CLI_VERSION__ === "string" ? __CLI_VERSION__ : "dev";

const GLOBAL_OPTIONS: Options = {
  json: { type: "boolean" },
  token: { type: "string" },
  lang: { type: "string" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
};

function wantsJson(argv: string[]): boolean {
  const end = argv.indexOf("--");
  return (end === -1 ? argv : argv.slice(0, end)).includes("--json");
}

/** El banner sólo para humanos: nunca en tubería, con NO_COLOR o con --json. */
function showBanner(json: boolean) {
  if (!BANNER || json || !process.stdout.isTTY || process.env.NO_COLOR) return;
  process.stdout.write((BANNER.endsWith("\n") ? BANNER : BANNER + "\n") + "\n");
}

/**
 * Posiciones de los posicionales ANTES de `--`, saltando el valor de las banderas
 * globales con argumento (`--token X`). Sirve para ubicar comando y subcomando sin
 * conocer todavía las banderas del subcomando.
 */
function positionalIndexes(argv: string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") break;
    if (a === "--token" || a === "--lang") {
      i++;
      continue;
    }
    if (a.startsWith("-") && a !== "-") continue;
    out.push(i);
  }
  return out;
}

function parse(argv: string[], skip: number[], leaf: Leaf | undefined) {
  const rest = argv.filter((_, i) => !skip.includes(i));
  try {
    const { values, positionals } = parseArgs({
      args: rest,
      options: { ...GLOBAL_OPTIONS, ...(leaf?.options ?? {}) } as any,
      allowPositionals: true,
      strict: true,
    });
    return { values: values as Ctx["opts"], positionals };
  } catch (e) {
    // parseArgs agrega un consejo sobre `--` que confunde más de lo que ayuda.
    throw usageError((e as Error).message.split("\n")[0].split(". To specify")[0].replace(/\.?$/, "."), leaf?.usage);
  }
}

function findSub(cmd: Command, name: string) {
  return Object.entries(cmd.subs ?? {}).find(([n, l]) => n === name || l.aliases?.includes(name));
}

// «Did you mean» a la Cobra: la sugerencia va en la pista; nunca se corre sola.
function unknownCommand(name: string): CliError {
  const e = usageError(t(`Unknown command "${name}".`, `Comando desconocido "${name}".`));
  const names = COMMANDS.flatMap((c) => [c.name, ...(c.aliases ?? [])]);
  const hint = didYouMean(name, names, "easybits ", (n) => findCommand(n)?.name ?? n);
  if (hint) e.hint = `${localHint(hint)}\n${t("Run", "Corre")}: easybits --help`;
  return e;
}

function unknownSub(cmd: Command, name: string): CliError {
  const e = usageError(t(`Unknown subcommand "${cmd.name} ${name}".`, `Subcomando desconocido "${cmd.name} ${name}".`), `easybits ${cmd.name} <${Object.keys(cmd.subs ?? {}).join("|")}>`);
  const names = Object.entries(cmd.subs ?? {}).flatMap(([n, l]) => [n, ...(l.aliases ?? [])]);
  const hint = didYouMean(name, names, `easybits ${cmd.name} `, (n) => findSub(cmd, n)?.[0] ?? n);
  if (hint) e.hint = `${localHint(hint)}\n${e.hint}`;
  return e;
}

/** Aviso tenue en stderr para quien usa una forma vieja; nunca con --json. */
function aliasNote([en, es]: [string, string]) {
  const note = t(en, es);
  const dim = process.stderr.isTTY && !process.env.NO_COLOR;
  process.stderr.write(dim ? `\x1b[2m${note}\x1b[0m\n` : `${note}\n`);
}

/** «Did you mean» de suggest.ts (puro, en inglés) en el idioma de la corrida. */
const localHint = (hint: string) => hint.replace("Did you mean this?", t("Did you mean this?", "¿Quisiste decir esto?"));

async function main(input: string[]): Promise<void> {
  // El TAB de la terminal: antes de parsear nada, y nunca con avisos ni errores en voz alta.
  if (input[0] === "__complete") return completeCmd(input.slice(1), COMMANDS);
  // La regla de nombres (aliases.ts): lo viejo sigue funcionando y avisa la forma nueva.
  const { argv, notes } = normalizeArgs(input);
  if (!wantsJson(argv)) notes.forEach(aliasNote);
  const pos = positionalIndexes(argv);
  const cmdName = pos.length ? argv[pos[0]] : undefined;

  if (!cmdName || cmdName === "help") {
    const topicName = cmdName === "help" && pos[1] != null ? argv[pos[1]] : undefined;
    const topic = topicName ? findCommand(topicName) : undefined;
    if (topicName && !topic) throw unknownCommand(topicName);
    // `easybits help db query` = `easybits db query --help` (como `gh help repo view`).
    const subName = topic?.subs && pos[2] != null ? argv[pos[2]] : undefined;
    const sub = topic && subName ? findSub(topic, subName) : undefined;
    if (topic && subName && !sub) throw unknownSub(topic, subName);
    const { values } = parse(argv, pos.slice(0, sub ? 3 : 2), undefined);
    if (values.version) {
      console.log(VERSION);
      return;
    }
    if (sub) {
      console.log(leafHelp(sub[1]));
      return;
    }
    if (topic) {
      console.log(commandHelp(topic));
      return;
    }
    showBanner(values.json === true);
    console.log(globalHelp(VERSION));
    return;
  }

  const cmd = findCommand(cmdName);
  if (!cmd) throw unknownCommand(cmdName);

  let leaf = cmd.leaf;
  let subKey: string | undefined;
  const skip = [pos[0]];
  if (cmd.subs) {
    const subName = pos[1] != null ? argv[pos[1]] : undefined;
    const entry = subName ? findSub(cmd, subName) : undefined;
    if (entry) {
      leaf = entry[1];
      subKey = entry[0];
      skip.push(pos[1]);
    } else if (subName) {
      throw unknownSub(cmd, subName);
    } else if (cmd.defaultSub && !argv.includes("--help") && !argv.includes("-h")) {
      leaf = cmd.subs[cmd.defaultSub];
      subKey = cmd.defaultSub;
    } else if (!argv.includes("--help") && !argv.includes("-h")) {
      throw usageError(t(`Missing subcommand for "${cmd.name}".`, `Falta el subcomando de "${cmd.name}".`), `easybits ${cmd.name} <${Object.keys(cmd.subs).join("|")}>`);
    }
  }

  const { values, positionals } = parse(argv, skip, leaf);
  if (values.version) {
    console.log(VERSION);
    return;
  }
  if (values.help || !leaf) {
    console.log(leaf && (leaf !== cmd.subs?.[cmd.defaultSub ?? ""] || skip.length > 1) ? leafHelp(leaf) : commandHelp(cmd));
    return;
  }

  const ctx: Ctx = {
    json: values.json === true,
    token: typeof values.token === "string" ? values.token : undefined,
    args: positionals,
    opts: values,
  };
  // Nombres en vez de ids: la tabla de refs.ts dice qué posicional es un recurso.
  const refKey = `${cmd.name} ${subKey ?? ""}`.trim();
  const target = leaf;
  const run = async () => {
    await resolveRefs(ctx, refKey);
    await target.run.call(target, ctx);
  };
  try {
    await run();
  } catch (e) {
    // El access token dura 1 h: un 401 con sesión casi siempre es eso. Se refresca UNA vez
    // y se repite el comando (un 401 llega antes de que la API haga nada).
    if (e instanceof EasybitsError && e.status === 401 && usedSession() && (await forceRefresh())) {
      await run();
      return;
    }
    throw e;
  }
}

const argv = process.argv.slice(2);
// El idioma antes que nada: la ayuda y hasta el primer error de uso ya salen en él.
setLang(detectLang(langFlag(argv)));
// El aviso de versión nueva sólo para una persona: nunca con --json ni sin terminal. La
// consulta a npm (una vez al día) corre en paralelo al comando.
const notice = process.stderr.isTTY && !wantsJson(argv) && !argv.includes("doctor") && argv[0] !== "__complete" ? updateNotice(VERSION) : null;
main(argv)
  .catch((err: unknown) => {
  const e: CliError = toCliError(err);
  // Una bandera o comando que esta versión no conoce, habiendo una más nueva: dilo.
  const latest = e.code === "usage" ? cachedNewer(VERSION) : null;
  if (latest) e.hint = `${e.hint ? e.hint + "\n" : ""}${t(`You have ${VERSION}; ${latest} is out and may have it. Run: ${UPGRADE}`, `Tienes ${VERSION}; ya salió ${latest} y quizá lo trae. Corre: ${UPGRADE}`)}`;
  if (wantsJson(argv)) {
    // Con --json el error va a STDOUT: es el único canal que parsea un agente. Mismo
    // formato que el CLI hermano `ghosty`: { error, code (= código de salida), hint }.
    process.stdout.write(JSON.stringify({ error: e.message, code: e.exitCode, ...(e.hint ? { hint: e.hint } : {}) }) + "\n");
  } else {
    process.stderr.write(`Error: ${e.message}\n`);
    if (e.hint) process.stderr.write(`${e.hint}\n`);
  }
  process.exitCode = e.exitCode || EXIT.API;
  })
  // Después de la salida del comando, para no meterse a media tabla.
  .then(() => notice)
  .then((line) => {
    if (line) process.stderr.write(`\n${line}\n`);
  });
