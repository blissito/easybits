#!/usr/bin/env node
import { parseArgs } from "node:util";
import type { Ctx, Leaf, Options } from "./types.js";
import { findCommand } from "./commands/index.js";
import { commandHelp, globalHelp, leafHelp } from "./help.js";
import { BANNER } from "./banner.js";
import { EasybitsError } from "@easybits.cloud/sdk";
import { CliError, EXIT, toCliError, usageError } from "./errors.js";
import { forceRefresh, usedSession } from "./client.js";

declare const __CLI_VERSION__: string;
const VERSION = typeof __CLI_VERSION__ === "string" ? __CLI_VERSION__ : "dev";

const GLOBAL_OPTIONS: Options = {
  json: { type: "boolean" },
  token: { type: "string" },
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
    if (a === "--token") {
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

async function main(argv: string[]): Promise<void> {
  const pos = positionalIndexes(argv);
  const cmdName = pos.length ? argv[pos[0]] : undefined;

  if (!cmdName || cmdName === "help") {
    const topic = cmdName === "help" && pos[1] != null ? findCommand(argv[pos[1]]) : undefined;
    const { values } = parse(argv, pos.slice(0, 2), undefined);
    if (values.version) {
      console.log(VERSION);
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
  if (!cmd) throw usageError(`Unknown command "${cmdName}".`);

  let leaf = cmd.leaf;
  const skip = [pos[0]];
  if (cmd.subs) {
    const subName = pos[1] != null ? argv[pos[1]] : undefined;
    const entry = subName
      ? Object.entries(cmd.subs).find(([n, l]) => n === subName || l.aliases?.includes(subName))
      : undefined;
    if (entry) {
      leaf = entry[1];
      skip.push(pos[1]);
    } else if (subName) {
      throw usageError(`Unknown subcommand "${cmd.name} ${subName}".`, `easybits ${cmd.name} <${Object.keys(cmd.subs).join("|")}>`);
    } else if (cmd.defaultSub && !argv.includes("--help") && !argv.includes("-h")) {
      leaf = cmd.subs[cmd.defaultSub];
    } else if (!argv.includes("--help") && !argv.includes("-h")) {
      throw usageError(`Missing subcommand for "${cmd.name}".`, `easybits ${cmd.name} <${Object.keys(cmd.subs).join("|")}>`);
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
  try {
    await leaf.run.call(leaf, ctx);
  } catch (e) {
    // El access token dura 1 h: un 401 con sesión casi siempre es eso. Se refresca UNA vez
    // y se repite el comando (un 401 llega antes de que la API haga nada).
    if (e instanceof EasybitsError && e.status === 401 && usedSession() && (await forceRefresh())) {
      await leaf.run.call(leaf, ctx);
      return;
    }
    throw e;
  }
}

const argv = process.argv.slice(2);
main(argv).catch((err: unknown) => {
  const e: CliError = toCliError(err);
  if (wantsJson(argv)) {
    // Con --json el error va a STDOUT: es el único canal que parsea un agente. Mismo
    // formato que el CLI hermano `ghosty`: { error, code (= código de salida), hint }.
    process.stdout.write(JSON.stringify({ error: e.message, code: e.exitCode, ...(e.hint ? { hint: e.hint } : {}) }) + "\n");
  } else {
    process.stderr.write(`Error: ${e.message}\n`);
    if (e.hint) process.stderr.write(`${e.hint}\n`);
  }
  process.exitCode = e.exitCode || EXIT.API;
});
