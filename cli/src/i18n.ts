// Un idioma según el locale: el CLI habla español con LANG=es_* (o `--lang es` / EASYBITS_LANG=es)
// y en otro caso inglés. Dos piezas:
// - `t(en, es)`: los textos propios del CLI (errores, pistas, líneas de éxito, ayuda). Las llaves
//   de --json NUNCA se traducen; sólo el texto para personas (y `error`/`hint`, que son prosa).
// - `serverText(msg)`: la API de EasyBits contesta casi todo en inglés y algunos mensajes de las
//   rutas de agentes en español; el diccionario de abajo pasa cada uno al idioma de la corrida.
//   Un mensaje que no esté ahí sale tal cual.
// Sin imports a propósito: el test lo carga directo.

export type Lang = "es" | "en";
let current: Lang | null = null;

/** Idioma de esta corrida: `--lang`, luego EASYBITS_LANG, luego LC_ALL / LC_MESSAGES / LANG. */
export function detectLang(flag?: string, env: Record<string, string | undefined> = process.env): Lang {
  const pick = (v?: string): Lang | null =>
    v && /^es\b|^es[_-]/i.test(v) ? "es" : v && /^en\b|^en[_-]|^c$|^posix$/i.test(v) ? "en" : null;
  return pick(flag) ?? pick(env.EASYBITS_LANG) ?? pick(env.LC_ALL) ?? pick(env.LC_MESSAGES) ?? pick(env.LANG) ?? "en";
}

export function setLang(l: Lang) {
  current = l;
}
export const lang = (): Lang => current ?? (current = detectLang());

/** El texto en el idioma de la corrida. */
export const t = (en: string, es: string): string => (lang() === "es" ? es : en);

/** `--lang X` / `--lang=X` del argv crudo (antes de parsear: la ayuda y los errores de uso ya lo usan). */
export function langFlag(argv: string[]): string | undefined {
  const end = argv.indexOf("--");
  const head = end === -1 ? argv : argv.slice(0, end);
  const i = head.indexOf("--lang");
  if (i !== -1) return head[i + 1];
  return head.find((a) => a.startsWith("--lang="))?.slice(7);
}

// `{}` = una parte variable. Sacado de las rutas de la API (agentes con máquina, agent spec) y de
// los errores más comunes. Los que la API manda en ESPAÑOL: [español, inglés].
const FROM_ES: Array<[string, string]> = [
  ["ruta inválida", "invalid path"],
  ["cuerpo vacío", "empty body"],
  ["archivo demasiado grande (máx 10 MB)", "file too large (max 10 MB)"],
  ["skill demasiado grande (máx 25 MB)", "skill too large (max 25 MB)"],
  ["slug inválido ([a-z0-9-], máx 64)", "invalid slug ([a-z0-9-], max 64)"],
  ["slug inválido", "invalid slug"],
  ["SKILL.md sin frontmatter (--- name / description ---)", "SKILL.md has no frontmatter (--- name / description ---)"],
  ["frontmatter sin `{}:`", "frontmatter has no `{}:`"],
  ["`{}:` vacío", "`{}:` is empty"],
  ["`{}:` lleva un \": \" sin comillas; entrecomilla el valor o la skill se descarta", "`{}:` has an unquoted \": \"; quote the value or the skill is dropped"],
  ["asset con nombre inválido: {}", "asset with an invalid name: {}"],
  ["asset {} sin contentBase64", "asset {} has no contentBase64"],
  ["este agente es anterior al revive: recréalo", "this agent predates revive: recreate it"],
  ["falta markdown (el contenido de SKILL.md)", "missing markdown (the SKILL.md content)"],
  ["nada que cambiar: systemPrompt y/o systemPromptMode", "nothing to change: systemPrompt and/or systemPromptMode"],
  ["agente_sin_maquina: template \"{}\" no expone el system prompt por archivo", "agent without a machine: template \"{}\" does not expose its system prompt as a file"],
  ["el cerebro la ve tras el siguiente reinicio: POST …/restart", "the engine sees it after the next restart: POST …/restart"],
  ["deja de verla tras el siguiente reinicio: POST …/restart", "it stops seeing it after the next restart: POST …/restart"],
];

// Los que la API manda en INGLÉS: [inglés, español].
const FROM_EN: Array<[string, string]> = [
  ["agent not found", "agente no encontrado"],
  ["sandbox not found", "sandbox no encontrado"],
  ["Method not allowed", "Método no permitido"],
  ["template and env required", "faltan template y env"],
  ["the file has no template", "el archivo no trae template"],
  ["missing values for {}: export them in your environment (a new agent has nothing to keep)", "faltan valores para {}: expórtalos en tu entorno (un agente nuevo no tiene nada que conservar)"],
  ["agent failed to start: {}", "el agente no arrancó: {}"],
  ["Unauthorized", "No autorizado"],
  ["Forbidden", "Prohibido"],
  ["Rate limit exceeded", "Límite de peticiones excedido"],
];

type Compiled = { re: RegExp; to: string };
const compiled: Partial<Record<Lang, Compiled[]>> = {};
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const compile = (s: string) => new RegExp(`^${s.split("{}").map(escape).join("(.+?)")}$`, "s");

/** Un mensaje de la API en el idioma de la corrida (los que ya están en ese idioma, tal cual). */
export function serverText(msg: string, l: Lang = lang()): string {
  if (!msg) return msg;
  compiled[l] ??= (l === "en" ? FROM_ES : FROM_EN).map(([from, to]) => ({ re: compile(from), to }));
  for (const c of compiled[l]!) {
    const m = c.re.exec(msg);
    if (!m) continue;
    let i = 1;
    return c.to.replace(/\{\}/g, () => m[i++] ?? "");
  }
  return msg;
}
