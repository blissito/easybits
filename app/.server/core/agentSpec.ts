// El agente como ARCHIVO (`easybits agents export` / `easybits apply`): formato, secretos y el
// PLAN, sin red ni base para poder probarlo solo (test/agentSpec.test.ts). La parte con I/O
// (leer el estado de la caja y ejecutar las acciones) vive en agentSpecOperations.ts.
//
// Reglas (las mismas que `ghosty apply`):
// - Declarativo: un campo AUSENTE del archivo no se toca. Lo presente se agrega o se cambia;
//   QUITAR lo que falta exige `prune` (sin él, el plan lo enseña con `!`).
// - Los secretos nunca salen: se exportan como `${NOMBRE}`. Al aplicar, el CLI manda sólo los
//   valores de las variables que el archivo nombra y que existen en su entorno; un `${X}` sin
//   valor conserva el valor de hoy. Las referencias `$secret:NOMBRE` (vault) viajan tal cual.
// - El plan es una lista de cambios `+ ~ - !` (el `!` no se aplica: explica por qué no) y una
//   lista de ACCIONES que el ejecutor corre en orden; env, MCP y skills piden un reinicio al final.
import { createHash } from "node:crypto";
import { parse, stringify } from "yaml";

export type McpSpec = {
  name: string;
  type?: "http" | "sse";
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
};

export type AgentSpec = {
  kind: "easybits-agent";
  version: 1;
  id?: string;
  name?: string | null;
  template?: string;
  promptMode?: "append" | "replace";
  prompt?: string;
  env?: Record<string, string>;
  mcp?: McpSpec[];
  skills?: string[];
  files?: string[];
};

/** Forma del protocolo ACP (la que guarda la fila): env/headers como lista {name,value}. */
export type NameValue = { name: string; value: string };
export type AcpServer =
  | { name: string; command: string; args?: string[]; env?: NameValue[] }
  | { type: "http" | "sse"; name: string; url: string; headers?: NameValue[] };

/** Lo que el agente ES hoy. `hashes` = sha256 por archivo (skills por slug, files por ruta). */
export type AgentState = {
  id: string;
  name: string | null;
  template: string;
  machine: boolean;
  prompt?: { text: string; mode: "append" | "replace" };
  env?: Record<string, string>;
  mcp?: AcpServer[];
  skills?: Record<string, Record<string, string>>;
  files?: Record<string, string>;
};

/** Lo que el CLI sube con `apply <dir>`: skills (carpeta) y archivos de conocimiento, en base64. */
export type Uploads = {
  skills?: Record<string, Array<{ path: string; contentBase64: string }>>;
  files?: Record<string, string>;
};

export type Change = { op: "+" | "~" | "-" | "!"; what: string };
export type Action =
  | { kind: "name"; name: string }
  | { kind: "prompt"; text?: string; mode?: "append" | "replace" }
  | { kind: "env"; env: Record<string, string> }
  | { kind: "mcp"; servers: AcpServer[] }
  | { kind: "skill-put"; slug: string; markdown: string; assets: Array<{ name: string; contentBase64: string }> }
  | { kind: "skill-rm"; slug: string }
  | { kind: "file-put"; path: string; contentBase64: string }
  | { kind: "file-rm"; path: string }
  | { kind: "restart" };
export type Plan = { changes: Change[]; actions: Action[] };

// ── Secretos ──────────────────────────────────────────────────────────────────────────────

/** Llaves que huelen a secreto: su valor se exporta como `${NOMBRE}`. */
export const SECRET_KEY = /KEY|TOKEN|SECRET|PASS|AUTH|CRED|PRIVATE|COOKIE|SESSION|BEARER/i;
/** Un valor con credenciales dentro (`postgres://u:p@host`) también es secreto. */
const URL_WITH_CREDS = /:\/\/[^/\s:@]+:[^@\s]+@/;
const PLACEHOLDER = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const ONLY_PLACEHOLDER = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

/**
 * Env que pone la PLATAFORMA (tokens internos, la llave de casa, el prompt): ni sale en el
 * export ni se toca al aplicar. El prompt tiene sus propios campos.
 */
export const MANAGED_ENV = new Set([
  "SYSTEM_PROMPT",
  "SYSTEM_PROMPT_MODE",
  "ACP_AGENT_TOKEN",
  "OPENCLAW_GATEWAY_TOKEN",
  "NANOCLAW_ADMIN_TOKEN",
  "ADMIN_TOKEN",
  "IS_SANDBOX",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "FORMMY_SECRET_KEY",
  "FORMMY_API_URL",
]);

const refName = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase();
const isSecret = (key: string, value: string) =>
  !value.includes("$secret:") && (SECRET_KEY.test(key) || URL_WITH_CREDS.test(value));
const hideValue = (ref: string, key: string, value: string) => (isSecret(key, value) ? `\${${refName(ref)}}` : value);

/** Sustituye `${X}` con los valores dados. Devuelve el texto y los nombres que faltaron. */
export function fillPlaceholders(value: string, secrets: Record<string, string>): { value: string; missing: string[] } {
  const missing: string[] = [];
  const out = value.replace(PLACEHOLDER, (m, n: string) => {
    if (secrets[n] !== undefined) return secrets[n];
    missing.push(n);
    return m;
  });
  return { value: out, missing };
}

/** Los nombres `${X}` que aparecen en un texto (el CLI manda sólo esos, si están en su entorno). */
export function placeholderNames(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

// ── Formato ───────────────────────────────────────────────────────────────────────────────

const toMap = (l?: NameValue[]) => (l?.length ? Object.fromEntries(l.map((x) => [x.name, x.value])) : undefined);
const toList = (m?: Record<string, string>) => (m ? Object.entries(m).map(([name, value]) => ({ name, value: String(value) })) : undefined);

export function mcpToSpec(s: AcpServer, hide = true): McpSpec {
  const mask = (m?: Record<string, string>) =>
    m && hide ? Object.fromEntries(Object.entries(m).map(([k, v]) => [k, hideValue(`${s.name}_${k}`, k, v)])) : m;
  if ("url" in s) {
    return { name: s.name, type: s.type, url: s.url, ...(s.headers?.length ? { headers: mask(toMap(s.headers)) } : {}) };
  }
  return {
    name: s.name,
    command: s.command,
    ...(s.args?.length ? { args: s.args } : {}),
    ...(s.env?.length ? { env: mask(toMap(s.env)) } : {}),
  };
}

export function mcpFromSpec(s: McpSpec): AcpServer {
  if (s.url) return { type: s.type ?? "http", name: s.name, url: s.url, ...(s.headers ? { headers: toList(s.headers) } : {}) };
  return { name: s.name, command: s.command ?? "", ...(s.args?.length ? { args: s.args } : {}), ...(s.env ? { env: toList(s.env) } : {}) };
}

/** El estado de hoy como archivo. Secretos como `${NOMBRE}`; lo de la plataforma no sale. */
export function stateToSpec(st: AgentState): AgentSpec {
  const spec: AgentSpec = { kind: "easybits-agent", version: 1, id: st.id, name: st.name, template: st.template };
  if (!st.machine) return spec;
  if (st.prompt) {
    spec.promptMode = st.prompt.mode;
    spec.prompt = st.prompt.text;
  }
  const env = Object.entries(st.env ?? {}).filter(([k]) => !MANAGED_ENV.has(k));
  if (env.length) spec.env = Object.fromEntries(env.map(([k, v]) => [k, hideValue(k, k, v)]));
  spec.mcp = (st.mcp ?? []).map((s) => mcpToSpec(s));
  spec.skills = Object.keys(st.skills ?? {}).sort();
  spec.files = Object.keys(st.files ?? {}).sort();
  return spec;
}

export function specToYaml(spec: AgentSpec): string {
  return `# EasyBits agent — easybits apply <this file> [--dry-run] [--prune]\n${stringify(spec, { lineWidth: 0 })}`;
}

/** Lee un archivo (YAML o JSON) y valida lo mínimo. Lanza Error con el motivo. */
export function parseAgentSpec(text: string): AgentSpec {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    throw new Error(`not valid YAML/JSON: ${(e as Error).message}`);
  }
  const x = raw as Partial<AgentSpec> | null;
  if (!x || typeof x !== "object" || Array.isArray(x)) throw new Error("the file is not an agent (a YAML/JSON object)");
  if (x.kind !== undefined && x.kind !== "easybits-agent") throw new Error(`kind must be easybits-agent (got ${String(x.kind)})`);
  if (x.promptMode !== undefined && x.promptMode !== "append" && x.promptMode !== "replace") throw new Error("promptMode: append | replace");
  if (x.prompt !== undefined && typeof x.prompt !== "string") throw new Error("prompt must be text");
  for (const k of ["env"] as const) {
    if (x[k] !== undefined && (typeof x[k] !== "object" || Array.isArray(x[k]))) throw new Error(`${k} must be a map KEY: value`);
  }
  if (x.mcp !== undefined && !Array.isArray(x.mcp)) throw new Error("mcp must be a list");
  for (const s of x.mcp ?? []) {
    if (!s?.name) throw new Error("every mcp entry needs a name");
    if (!s.url && !s.command) throw new Error(`mcp ${s.name}: needs url (http) or command (stdio)`);
  }
  for (const k of ["skills", "files"] as const) {
    if (x[k] !== undefined && (!Array.isArray(x[k]) || x[k]!.some((v) => typeof v !== "string"))) throw new Error(`${k} must be a list of names`);
  }
  return { ...(x as AgentSpec), kind: "easybits-agent", version: 1 };
}

// ── Plan ──────────────────────────────────────────────────────────────────────────────────

export const sha256 = (b64: string) => createHash("sha256").update(Buffer.from(b64, "base64")).digest("hex");
/** JSON con llaves ordenadas: el orden de las llaves no es un cambio. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object).sort().filter((k) => (v as any)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon((v as any)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}
const same = (a: unknown, b: unknown) => canon(a) === canon(b);

/**
 * Lo que hay que cambiar para que el agente `cur` quede como `want`. `secrets` ya viene del CLI;
 * `uploads` son las carpetas de `apply <dir>`. Puro: el ejecutor corre `actions` en orden.
 */
export function planAgentSpec(
  cur: AgentState,
  want: AgentSpec,
  opts: { prune?: boolean; secrets?: Record<string, string>; uploads?: Uploads } = {}
): Plan {
  const changes: Change[] = [];
  const actions: Action[] = [];
  const prune = !!opts.prune;
  const secrets = opts.secrets ?? {};
  const up = opts.uploads ?? {};
  let restart = false;

  if (want.template && want.template !== cur.template) {
    changes.push({ op: "!", what: `template ${cur.template} ≠ ${want.template}: an agent can't change template (easybits apply <file> --create makes a new one)` });
  }
  if (want.name != null && want.name !== cur.name) {
    changes.push({ op: "~", what: `name: ${cur.name ?? "-"} → ${want.name}` });
    actions.push({ kind: "name", name: want.name });
  }

  const configFields = (["prompt", "promptMode", "env", "mcp", "skills", "files"] as const).filter((k) => want[k] !== undefined);
  if (!cur.machine) {
    if (configFields.length || up.skills || up.files) {
      changes.push({ op: "!", what: `${cur.template} has no machine of its own: only name applies (${configFields.join(", ")} ignored)` });
    }
    return { changes, actions };
  }

  // Prompt: texto exacto y modo.
  const p = cur.prompt ?? { text: "", mode: "append" as const };
  const textChanged = want.prompt !== undefined && want.prompt !== p.text;
  const modeChanged = want.promptMode !== undefined && want.promptMode !== p.mode;
  if (textChanged || modeChanged) {
    const parts = [
      textChanged ? `${p.text.length} → ${want.prompt!.length} chars` : "",
      modeChanged ? `mode ${p.mode} → ${want.promptMode}` : "",
    ].filter(Boolean);
    changes.push({ op: "~", what: `prompt: ${parts.join(", ")}` });
    actions.push({ kind: "prompt", ...(textChanged ? { text: want.prompt } : {}), ...(modeChanged ? { mode: want.promptMode } : {}) });
  }

  // Env: agrega/cambia; quitar con prune. Lo de la plataforma no se toca.
  if (want.env) {
    const curEnv = cur.env ?? {};
    const next = { ...curEnv };
    const marks: string[] = [];
    for (const [k, raw] of Object.entries(want.env)) {
      if (MANAGED_ENV.has(k)) {
        changes.push({ op: "!", what: `env ${k}: set by the platform${k.startsWith("SYSTEM_PROMPT") ? " (use prompt / promptMode)" : ""}; ignored` });
        continue;
      }
      const { value, missing } = fillPlaceholders(String(raw), secrets);
      if (missing.length) {
        if (!(k in curEnv)) changes.push({ op: "!", what: `env ${k}: \${${missing.join("}, ${")}} not in your environment and not set today` });
        continue; // sin valor: conserva el de hoy
      }
      if (curEnv[k] !== value) (next[k] = value, marks.push(`${k in curEnv ? "~" : "+"}${k}`));
    }
    for (const k of Object.keys(curEnv)) {
      if (MANAGED_ENV.has(k) || k in want.env) continue;
      if (prune) (delete next[k], marks.push(`-${k}`));
      else changes.push({ op: "!", what: `env ${k}: not in the file (--prune removes it)` });
    }
    if (marks.length) {
      changes.push({ op: "~", what: `env: ${marks.join(" ")}` });
      actions.push({ kind: "env", env: next });
      restart = true;
    }
  }

  // MCP: la lista del archivo; quitar un servidor exige prune. `${X}` sin valor = el de hoy.
  if (want.mcp) {
    const curList = cur.mcp ?? [];
    const byName = new Map(curList.map((s) => [s.name, s]));
    const next: AcpServer[] = [];
    let blocked = false;
    for (const s of want.mcp) {
      const old = byName.get(s.name);
      const oldVals = old ? ("url" in old ? toMap(old.headers) : toMap(old.env)) ?? {} : {};
      const fill = (m: Record<string, string> | undefined) => {
        if (!m) return m;
        const out: Record<string, string> = {};
        for (const [k, raw] of Object.entries(m)) {
          const { value, missing } = fillPlaceholders(String(raw), secrets);
          if (!missing.length) out[k] = value;
          else if (ONLY_PLACEHOLDER.test(String(raw)) && k in oldVals) out[k] = oldVals[k];
          else {
            changes.push({ op: "!", what: `mcp ${s.name}: ${k} needs \${${missing.join("}, ${")}} (export it before apply)` });
            blocked = true;
          }
        }
        return out;
      };
      const entry = mcpFromSpec({ ...s, headers: fill(s.headers), env: fill(s.env) });
      next.push(entry);
      if (!old) changes.push({ op: "+", what: `mcp ${s.name}` });
      else if (!same(old, entry)) changes.push({ op: "~", what: `mcp ${s.name}` });
    }
    const wanted = new Set(want.mcp.map((s) => s.name));
    for (const s of curList) {
      if (wanted.has(s.name)) continue;
      if (prune) changes.push({ op: "-", what: `mcp ${s.name}` });
      else (changes.push({ op: "!", what: `mcp ${s.name}: not in the file (--prune removes it)` }), next.push(s));
    }
    if (blocked) changes.push({ op: "!", what: "mcp: not applied until every value is available" });
    else if (!same(next, curList)) (actions.push({ kind: "mcp", servers: next }), (restart = true));
  }

  // Skills: con carpeta se suben (si cambiaron); sin carpeta sólo se pueden conservar.
  const upSkills = up.skills ?? {};
  if (want.skills || Object.keys(upSkills).length) {
    const curSkills = cur.skills ?? {};
    const listed = [...new Set([...(want.skills ?? []), ...Object.keys(upSkills)])];
    for (const slug of listed) {
      const files = upSkills[slug];
      const exists = slug in curSkills;
      if (files) {
        const md = files.find((f) => f.path === "SKILL.md");
        if (!md) {
          changes.push({ op: "!", what: `skill ${slug}: its folder has no SKILL.md` });
          continue;
        }
        const hashes = Object.fromEntries(files.map((f) => [f.path, sha256(f.contentBase64)]));
        if (exists && same(Object.entries(hashes).sort(), Object.entries(curSkills[slug]).sort())) continue;
        changes.push({ op: exists ? "~" : "+", what: `skill ${slug} (${files.length} file(s))` });
        actions.push({
          kind: "skill-put",
          slug,
          markdown: Buffer.from(md.contentBase64, "base64").toString("utf8"),
          assets: files.filter((f) => f.path !== "SKILL.md").map((f) => ({ name: f.path, contentBase64: f.contentBase64 })),
        });
        restart = true;
      } else if (!exists) {
        changes.push({ op: "!", what: `skill ${slug}: not on the agent and no folder to upload (apply the exported directory)` });
      }
    }
    if (want.skills) {
      for (const slug of Object.keys(curSkills)) {
        if (listed.includes(slug)) continue;
        if (prune) (changes.push({ op: "-", what: `skill ${slug}` }), actions.push({ kind: "skill-rm", slug }), (restart = true));
        else changes.push({ op: "!", what: `skill ${slug}: not in the file (--prune removes it)` });
      }
    }
  }

  // Archivos de conocimiento (/data/work): igual que las skills, sin reinicio.
  const upFiles = up.files ?? {};
  if (want.files || Object.keys(upFiles).length) {
    const curFiles = cur.files ?? {};
    const listed = [...new Set([...(want.files ?? []), ...Object.keys(upFiles)])];
    for (const path of listed) {
      const b64 = upFiles[path];
      const exists = path in curFiles;
      if (b64 !== undefined) {
        if (exists && curFiles[path] === sha256(b64)) continue;
        changes.push({ op: exists ? "~" : "+", what: `file ${path}` });
        actions.push({ kind: "file-put", path, contentBase64: b64 });
      } else if (!exists) {
        changes.push({ op: "!", what: `file ${path}: not on the agent and not in files/ (apply the exported directory)` });
      }
    }
    if (want.files) {
      for (const path of Object.keys(curFiles)) {
        if (listed.includes(path)) continue;
        if (prune) (changes.push({ op: "-", what: `file ${path}` }), actions.push({ kind: "file-rm", path }));
        else changes.push({ op: "!", what: `file ${path}: not in the file (--prune removes it)` });
      }
    }
  }

  if (restart) actions.push({ kind: "restart" });
  return { changes, actions };
}
