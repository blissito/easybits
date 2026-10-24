/**
 * «La computadora del agente»: cada herramienta del turno es un PASO que el panel lateral
 * pinta según su tipo (navegador, terminal, editor, búsqueda), en vivo y en replay.
 * Compartido entre el servidor (siteTurns arma y guarda los pasos) y el cliente (el panel).
 *
 * Formato inspirado en los clones abiertos de «Manus's Computer» (Suna: par llamada/resultado
 * por paso; browser-use: estado del navegador con URL, título y elemento tocado).
 */

export type StepKind = "browser" | "terminal" | "editor" | "search" | "other";

/** Captura del navegador del agente en ese paso (sesiones browser_* de la caja de render). */
export type BrowserFrame = {
  url: string;
  title: string;
  /** JPEG del viewport en el CDN público. */
  image: string;
  viewport?: { width: number; height: number };
  /** Elemento que se tocó, en px del viewport: el panel lo marca (Manus no lo hace). */
  target?: { x: number; y: number; width: number; height: number };
  /** Qué hizo, en palabras: «Escribió “Cholula”», «Clic en Buscar». */
  action?: string;
  /** Sesión del navegador en la caja: «Tomar el control» la usa. Nunca sale en un replay público. */
  sessionId?: string;
};

/** Lo que obtuvo la herramienta (lo arma el worker, recortado y sin secretos). */
export type StepResult = {
  /** Salida en texto: la de un comando, o un resumen corto («120 líneas»). */
  summary?: string;
  exitCode?: number;
  /** Resultados de una búsqueda (url) o de buscar en archivos (path). */
  items?: { title: string; url?: string; path?: string }[];
  /** Cambio de un archivo: líneas quitadas y puestas. */
  diff?: { file?: string; removed: string[]; added: string[] };
};

/** Una tarea del plan del agente (TodoWrite). */
export type StepTodo = { content: string; status: "pending" | "in_progress" | "completed"; activeForm?: string };

export type AgentStep = {
  id: string;
  /** Nombre interno de la herramienta (Bash, Write, mcp__render__browser_act…). */
  tool: string;
  kind: StepKind;
  /** Argumento corto: archivo, URL, búsqueda. */
  detail?: string;
  /** Comando completo, cuando lo hay (terminal). */
  command?: string;
  /** Lo que el agente dijo que iba a hacer justo antes (su narración): el panel lo muestra
   *  en vez de repetir el comando, como un experto explicándole a otro. */
  intent?: string;
  status: "running" | "ok" | "error";
  startedAt: number;
  endedAt?: number;
  browser?: BrowserFrame;
  result?: StepResult;
  /** El plan completo, en el paso donde el agente lo escribió o lo actualizó. */
  todos?: StepTodo[];
};

/**
 * Herramientas de trámite (el plan, buscar qué tools hay): no son trabajo que mirar. El plan
 * sale en su franja; lo demás no se pinta como paso ni cuenta en el cierre.
 */
export function isPlumbing(tool: string): boolean {
  return /todowrite|^task(create|update|list|get|output|stop)$|toolsearch|tool_search|discover_tools/i.test(tool);
}

export function stepKind(tool: string): StepKind {
  const t = tool.toLowerCase();
  if (/browser_|render_url|screenshot|web_interact/.test(t)) return "browser";
  if (/websearch|web_search|research_search|search_docs|grep|glob|tool_?search|discover/.test(t)) return "search";
  if (isPlumbing(t)) return "other";
  if (/write|edit|patch|notebook|read|file|theme/.test(t)) return "editor";
  if (/bash|exec|_bg|logs|restart|launch|gs_box|sandbox|run_tool|npm|deploy/.test(t)) return "terminal";
  return "other";
}

/** Verbo del paso en español, como la píldora de Manus («Navegando», «Creando archivo»). */
export function stepVerb(s: Pick<AgentStep, "tool" | "kind">): string {
  const t = s.tool.toLowerCase();
  if (s.kind === "browser") return /open/.test(t) ? "Abriendo página" : /look/.test(t) ? "Mirando la página" : /close/.test(t) ? "Cerrando navegador" : "Usando el navegador";
  if (s.kind === "search") return /grep|glob/.test(t) ? "Buscando en archivos" : "Buscando";
  if (s.kind === "editor") return /read/.test(t) ? "Leyendo archivo" : /write/.test(t) ? "Creando archivo" : "Editando archivo";
  if (s.kind === "terminal") return /launch|deploy/.test(t) ? "Publicando" : "Ejecutando comando";
  return "Trabajando";
}

/** Herramienta que está usando el agente, para el encabezado: «usa el navegador». */
export const KIND_LABEL: Record<StepKind, string> = {
  browser: "el navegador",
  terminal: "la terminal",
  editor: "el editor",
  search: "la búsqueda",
  other: "sus herramientas",
};

/** Inserta o actualiza un paso por `id` (los eventos llegan como start → frames → end). */
export function upsertStep(steps: AgentStep[], patch: Partial<AgentStep> & { id: string }): AgentStep[] {
  const i = steps.findIndex((s) => s.id === patch.id);
  if (i === -1) return [...steps, patch as AgentStep];
  const next = steps.slice();
  next[i] = { ...next[i], ...patch, browser: patch.browser ?? next[i].browser, result: patch.result ?? next[i].result };
  return next;
}

/** Tope de pasos guardados por turno: un turno largo no debe crecer la fila sin límite. */
export const MAX_STEPS = 300;

const clip = (v: unknown, n: number) => (typeof v === "string" ? (v.length > n ? v.slice(0, n - 1) + "…" : v) : undefined);
const lines = (v: unknown) => (Array.isArray(v) ? v.slice(0, 41).map((l) => clip(l, 200) ?? "") : []);

/**
 * El resultado que mandó el worker, saneado otra vez en el servidor: forma y tamaño no se le
 * creen a la caja (la fila del turno guarda hasta MAX_STEPS pasos).
 */
export function cleanStepResult(v: unknown): StepResult | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  const out: StepResult = {};
  const summary = clip(r.summary, 2000);
  if (summary) out.summary = summary;
  if (typeof r.exitCode === "number" && Number.isFinite(r.exitCode)) out.exitCode = r.exitCode;
  if (Array.isArray(r.items)) {
    const items = r.items
      .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
      .slice(0, 10)
      .map((i) => ({
        title: clip(i.title, 200) ?? "",
        ...(typeof i.url === "string" && /^https?:\/\//.test(i.url) ? { url: clip(i.url, 500) } : {}),
        ...(typeof i.path === "string" ? { path: clip(i.path, 300) } : {}),
      }))
      .filter((i) => i.title && (i.url || i.path));
    if (items.length) out.items = items;
  }
  if (r.diff && typeof r.diff === "object") {
    const d = r.diff as Record<string, unknown>;
    const diff = { file: clip(d.file, 200), removed: lines(d.removed), added: lines(d.added) };
    if (diff.removed.length || diff.added.length) out.diff = diff;
  }
  return Object.keys(out).length ? out : undefined;
}

const TODO_STATUS = new Set(["pending", "in_progress", "completed"]);

export function cleanTodos(v: unknown): StepTodo[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const todos = v
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object" && typeof t.content === "string")
    .slice(0, 50)
    .map((t) => ({
      content: clip(t.content, 300)!,
      status: (TODO_STATUS.has(t.status as string) ? t.status : "pending") as StepTodo["status"],
      ...(typeof t.activeForm === "string" ? { activeForm: clip(t.activeForm, 300) } : {}),
    }));
  return todos.length ? todos : undefined;
}

/**
 * La salida de una tool que regresa JSON de ejecución (`sandbox_exec` de EasyBits:
 * `{exitCode, stdout, stderr}`) se lee como la de una terminal, no como JSON crudo.
 */
export function normalizeStepResult(r: StepResult | undefined): StepResult | undefined {
  if (!r?.summary || !/^\s*\{/.test(r.summary)) return r;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(r.summary);
  } catch {
    return r;
  }
  if (!o || typeof o !== "object" || !("stdout" in o || "stderr" in o)) return r;
  const out = [o.stdout, o.stderr].filter((x) => typeof x === "string" && x.trim()).join("\n").trim();
  return { ...r, summary: out || undefined, ...(typeof o.exitCode === "number" ? { exitCode: o.exitCode } : {}) };
}

/** El plan vigente del turno: el último paso que lo escribió. */
export function currentPlan(steps: AgentStep[], upTo = steps.length - 1): StepTodo[] | undefined {
  for (let i = Math.min(upTo, steps.length - 1); i >= 0; i--) if (steps[i].todos?.length) return steps[i].todos;
  return undefined;
}

/** Firma barata de los pasos: cambia cuando uno empieza, termina, gana captura o resultado. */
export function stepsSignature(steps: AgentStep[]): string {
  let done = 0, frames = 0, results = 0;
  for (const s of steps) {
    if (s.status !== "running") done++;
    if (s.browser) frames++;
    if (s.result) results++;
  }
  const last = steps[steps.length - 1];
  return `${steps.length}:${done}:${frames}:${results}:${last?.browser?.image ?? ""}`;
}

/** URL sin query ni hash: un `?token=` o `#access_token` no sale en un replay. */
function bareUrl(u: string): string {
  try {
    const x = new URL(u);
    return x.origin + x.pathname;
  } catch {
    return "";
  }
}

/**
 * Un paso tal como se ve en un replay PÚBLICO: sin el comando (puede traer llaves), sin
 * `detail` salvo el nombre del archivo, URLs sin query y sin `sessionId` (con él, quien vea el
 * replay podría manejar un navegador aún vivo).
 */
export function publicStep(s: AgentStep): AgentStep {
  const { command: _c, detail, browser, result, ...rest } = s;
  const out: AgentStep = { ...rest };
  if (s.kind === "editor" && detail) out.detail = detail.split("/").pop();
  // De un resultado sólo salen los enlaces de una búsqueda: la salida de un comando o un
  // diff pueden traer datos del cliente.
  const links = result?.items?.filter((i) => i.url).map((i) => ({ title: i.title, url: bareUrl(i.url!) })).filter((i) => i.url);
  if (links?.length) out.result = { items: links };
  if (browser) {
    const { sessionId: _s, ...b } = browser;
    out.browser = { ...b, url: bareUrl(b.url) };
  }
  return out;
}

/** Última frase de la narración entre dos herramientas: «Reviso cómo presenta sus planes». */
export function lastIntent(narration: string): string | undefined {
  const clean = narration.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  const parts = clean.split(/(?<=[.!?…:])\s+/).filter((x) => x.replace(/[^\p{L}\p{N}]/gu, "").length > 3);
  const last = parts[parts.length - 1];
  if (!last) return undefined;
  return last.length > 180 ? last.slice(0, 179) + "…" : last;
}

/**
 * Cierre del turno: cuánto trabajó, cuántos pasos y de 3 a 6 capturas distintas repartidas a lo
 * largo del turno como prueba de lo que hizo (las del plan no cuentan como paso).
 */
export function turnSummary(steps: AgentStep[], maxThumbs = 6) {
  const real = steps.filter((s) => !isPlumbing(s.tool));
  if (!real.length) return null;
  const start = Math.min(...real.map((s) => s.startedAt));
  const end = Math.max(...real.map((s) => s.endedAt ?? s.startedAt));
  const seen = new Set<string>();
  const frames = real.filter((s) => {
    const img = s.browser?.image;
    if (!img || seen.has(img)) return false;
    seen.add(img);
    return true;
  });
  const n = Math.min(maxThumbs, frames.length);
  const thumbs = n <= 1 ? frames.slice(0, n) : Array.from({ length: n }, (_, i) => frames[Math.round((i * (frames.length - 1)) / (n - 1))]);
  return { ms: Math.max(0, end - start), count: real.length, errors: real.filter((s) => s.status === "error").length, thumbs: thumbs.map((s) => ({ id: s.id, image: s.browser!.image, title: s.browser!.title })) };
}

/** «3 min», «45 s»: para el cierre del turno. */
export function formatWorked(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
