// Autocompletado en la terminal: `easybits completion zsh|bash|fish` imprime el script, que en
// cada TAB le pregunta al propio CLI (`easybits __complete -- <palabras> <actual>`). Así los
// comandos, subcomandos y flags salen de la misma tabla que la ayuda (COMMANDS) y nunca se
// desfasan, y los nombres de agentes, sandboxes y bases vienen de tu cuenta (caché de 5 min en
// ~/.cache/easybits). `__complete` corre ANTES de parsear: nunca falla en voz alta. La tabla de
// comandos llega por parámetro (importarla de aquí haría un ciclo con commands/index.ts).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Command, Ctx } from "../types.js";
import { need } from "../args.js";
import { usageError } from "../errors.js";
import { t } from "../i18n.js";
import { REF_ARGS, type RefKind } from "../refs.js";
import { listRefs } from "../resolve.js";

const GLOBAL_FLAGS = ["--json", "--token", "--lang", "--help", "--version"];
/** Flags cuyo valor es un agente. */
const AGENT_FLAGS = new Set(["--agent", "--like"]);

export type Want = { kind: "words"; words: string[] } | { kind: "names"; ref: RefKind };

const findSub = (c: Command, name: string) => Object.entries(c.subs ?? {}).find(([n, l]) => n === name || l.aliases?.includes(name));

/** Qué completar dadas las palabras ya escritas (sin `easybits`) y la actual. Puro para probarlo. */
export function completionFor(words: string[], current: string, commands: Command[]): Want {
  const names = commands.filter((c) => !c.name.startsWith("__")).map((c) => c.name);
  const prev = words[words.length - 1];
  if (prev && AGENT_FLAGS.has(prev)) return { kind: "names", ref: "agent" };
  if (!words.length) return { kind: "words", words: [...names, "help"] };
  const find = (n: string) => commands.find((c) => c.name === n || c.aliases?.includes(n));
  const cmd = find(words[0]);
  if (words[0] === "help") return { kind: "words", words: words.length === 1 ? names : Object.keys(find(words[1])?.subs ?? {}) };
  if (!cmd) return { kind: "words", words: [] };
  const sub = cmd.subs && words[1] ? findSub(cmd, words[1]) : undefined;
  const leaf = sub?.[1] ?? cmd.leaf;
  if (current.startsWith("-")) {
    const own = Object.keys(leaf?.options ?? {}).map((n) => `--${n}`);
    return { kind: "words", words: [...own, ...GLOBAL_FLAGS] };
  }
  if (cmd.subs && !sub) return { kind: "words", words: words.length === 1 ? Object.keys(cmd.subs) : [] };
  if (cmd.name === "completion") return { kind: "words", words: words.length === 1 ? ["zsh", "bash", "fish"] : [] };
  // Posicionales ya escritos después de comando y subcomando (sin flags ni el valor de un flag con valor).
  const opts = leaf?.options ?? {};
  let n = 0;
  for (let i = sub ? 2 : 1; i < words.length; i++) {
    const w = words[i];
    if (w.startsWith("--")) {
      const o = opts[w.slice(2)];
      if ((o?.type === "string" || w === "--token" || w === "--lang") && !w.includes("=")) i++;
      continue;
    }
    if (w.startsWith("-") && w !== "-") continue;
    n++;
  }
  const spec = REF_ARGS[sub ? `${cmd.name} ${sub[0]}` : cmd.name];
  if (spec && spec.index === n) return { kind: "names", ref: spec.kind };
  return { kind: "words", words: [] };
}

const cacheFile = () => join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "easybits", "complete.json");

/** Nombres de la cuenta con caché de 5 min (un TAB no debe esperar la red). */
async function namesOf(ctx: Ctx, kind: RefKind): Promise<string[]> {
  let cache: Partial<Record<RefKind, { at: number; names: string[] }>> = {};
  try {
    cache = JSON.parse(readFileSync(cacheFile(), "utf8"));
    const c = cache[kind];
    if (c && Date.now() - c.at < 5 * 60_000) return c.names;
  } catch {
    /* sin caché */
  }
  const names = [...new Set((await listRefs(ctx, kind)).map((x) => x.name).filter((x): x is string => !!x))];
  try {
    mkdirSync(dirname(cacheFile()), { recursive: true });
    writeFileSync(cacheFile(), JSON.stringify({ ...cache, [kind]: { at: Date.now(), names } }));
  } catch {
    /* sin caché: la próxima vez vuelve a pedir */
  }
  return names;
}

/** `easybits __complete -- <palabras…> <actual>`: una opción por renglón. Nunca falla en voz alta. */
export async function completeCmd(args: string[], commands: Command[]): Promise<void> {
  const rest = args[0] === "--" ? args.slice(1) : args;
  const current = rest.length ? rest[rest.length - 1] : "";
  const words = rest.slice(0, -1);
  let out: string[] = [];
  try {
    const want = completionFor(words, current, commands);
    // Sin terminal: el login nunca se abre desde un TAB (resolveCredential falla y queda vacío).
    const ctx: Ctx = { json: true, args: [], opts: {} };
    out = want.kind === "words" ? want.words : await namesOf(ctx, want.ref);
  } catch {
    out = [];
  }
  const cur = current.toLowerCase();
  process.stdout.write(out.filter((w) => w.toLowerCase().startsWith(cur)).join("\n") + "\n");
}

export function completionScript(shell: string): string | null {
  if (shell === "bash") {
    return `# easybits — bash completion: eval "$(easybits completion bash)" en ~/.bashrc
_easybits() {
  # Las palabras ANTES de cambiar IFS: el bash 3.2 de macOS junta \${arr[@]:1:n} con un IFS propio.
  local words=("\${COMP_WORDS[@]:1:COMP_CWORD-1}") cur="\${COMP_WORDS[COMP_CWORD]}"
  local IFS=$'\\n'
  COMPREPLY=( $(easybits __complete -- "\${words[@]}" "$cur" 2>/dev/null) )
}
complete -o default -F _easybits easybits
`;
  }
  if (shell === "zsh") {
    return `#compdef easybits
# easybits — zsh completion: source <(easybits completion zsh) en ~/.zshrc (después de compinit)
_easybits() {
  local -a opts
  opts=("\${(@f)$(easybits __complete -- "\${(@)words[2,CURRENT-1]}" "\${words[CURRENT]}" 2>/dev/null)}")
  compadd -a opts
}
compdef _easybits easybits
`;
  }
  if (shell === "fish") {
    return `# easybits — fish completion: easybits completion fish > ~/.config/fish/completions/easybits.fish
complete -c easybits -f -a "(easybits __complete -- (commandline -opc)[2..-1] (commandline -ct) 2>/dev/null)"
`;
  }
  return null;
}

export const completion: Command = {
  name: "completion",
  group: "Help",
  summary: "Shell completion script (zsh, bash, fish)",
  synopsis: "completion <shell>",
  leaf: {
    summary: "Print the completion script for your shell: commands, flags and your agents, sandboxes and databases",
    usage: "easybits completion <zsh|bash|fish>",
    examples: [
      "source <(easybits completion zsh)                  # add to ~/.zshrc, after compinit",
      'eval "$(easybits completion bash)"                 # add to ~/.bashrc',
      "easybits completion fish > ~/.config/fish/completions/easybits.fish",
    ],
    async run(ctx) {
      const shell = need(ctx, 0, "zsh|bash|fish", this.usage);
      const script = completionScript(shell);
      if (!script) throw usageError(t(`Unknown shell "${shell}".`, `Shell desconocido "${shell}".`), this.usage);
      process.stdout.write(script);
    },
  },
};
