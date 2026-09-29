// La regla de nombres del CLI (como `gh`): sustantivo + verbo; prender/apagar = los verbos
// `enable|disable`; `on|off` sólo como VALOR de un flag; flags en inglés. Esta capa traduce
// la forma nueva a lo que entienden los comandos y deja la vieja como alias con un aviso tenue
// en stderr (nunca con --json), para no romper scripts ni la memoria de nadie. Corre sobre el
// argv crudo, ANTES de parsear: así no hace falta declarar las banderas viejas en cada hoja.
// Sin imports a propósito: el test lo carga directo con --experimental-strip-types.

/** Mismo criterio que index.ts: posicionales antes de `--`, saltando el valor de `--token`. */
function positionals(argv: string[]): number[] {
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

const MACHINE_SUBS = ["ls", "list", "deploy", "release", "releases", "logs", "rollback", "secrets"];
const SANDBOX_NAMES = ["sandboxes", "sandbox", "sb"];
const AGENT_NAMES = ["agents", "agent"];

/** Devuelve el argv reescrito y los avisos para quien usó una forma vieja. */
export function normalizeArgs(input: string[]): { argv: string[]; notes: string[] } {
  const argv = [...input];
  const notes: string[] = [];
  const end = argv.indexOf("--");
  const head = end === -1 ? argv : argv.slice(0, end);
  const help = head.includes("--help") || head.includes("-h");
  let pos = positionals(argv);
  const at = (n: number) => (pos[n] != null ? argv[pos[n]] : undefined);

  // `config` y `mcp` eran dos comandos para lo mismo: ahora `mcp config [--stdio]`.
  if (at(0) === "config") {
    argv.splice(pos[0], 1, "mcp", "config");
    notes.push("`easybits config` is now `easybits mcp config`.");
  } else if (at(0) === "mcp" && at(1) == null && !help) {
    argv.splice(pos[0] + 1, 0, "config");
    argv.push("--stdio");
    notes.push("`easybits mcp` is now `easybits mcp config --stdio`.");
  }

  // `deploy` era alias del SUSTANTIVO machines (y chocaba con el verbo: `deploy deploy`).
  // Ahora es el verbo: `easybits deploy <machine>` = `machines deploy <machine>`.
  if (at(0) === "deploy") {
    const sub = at(1);
    if (sub && MACHINE_SUBS.includes(sub) && sub !== "deploy") {
      argv[pos[0]] = "machines";
      notes.push(`\`easybits deploy ${sub}\` is now \`easybits machines ${sub}\`.`);
    } else if (sub === "deploy") {
      argv[pos[0]] = "machines";
      notes.push("`easybits deploy deploy` is now `easybits deploy <machine>`.");
    } else {
      argv.splice(pos[0], 1, "machines", "deploy");
    }
    pos = positionals(argv);
  }

  // `machines release` (publica) contra `machines releases` (lista): se queda `deploy`.
  if ((at(0) === "machines" || at(0) === "machine") && at(1) === "release") {
    argv[pos[1]] = "deploy";
    notes.push("`machines release` is now `machines deploy`.");
  }

  // `--timeout` quería decir dos cosas: vida de la caja (create) y tope del comando (exec).
  // En create (sandboxes y agents) ahora es `--ttl`.
  const noun = SANDBOX_NAMES.includes(at(0) ?? "") ? "sandboxes" : AGENT_NAMES.includes(at(0) ?? "") ? "agents" : null;
  if (noun && (at(1) === "create" || at(1) === "new")) {
    const stop = argv.indexOf("--");
    for (let i = 0; i < (stop === -1 ? argv.length : stop); i++) {
      if (argv[i] === "--timeout" || argv[i].startsWith("--timeout=")) {
        argv[i] = argv[i].replace("--timeout", "--ttl");
        notes.push(`\`${noun} create --timeout\` is now \`--ttl\`${noun === "sandboxes" ? " (`--timeout` stays for `exec`)" : ""}.`);
      }
    }
  }

  return { argv, notes };
}
