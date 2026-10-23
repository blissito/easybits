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

export type AgentStep = {
  id: string;
  /** Nombre interno de la herramienta (Bash, Write, mcp__render__browser_act…). */
  tool: string;
  kind: StepKind;
  /** Argumento corto: archivo, URL, búsqueda. */
  detail?: string;
  /** Comando completo, cuando lo hay (terminal). */
  command?: string;
  status: "running" | "ok" | "error";
  startedAt: number;
  endedAt?: number;
  browser?: BrowserFrame;
};

export function stepKind(tool: string): StepKind {
  const t = tool.toLowerCase();
  if (/browser_|render_url|screenshot|web_interact/.test(t)) return "browser";
  if (/websearch|web_search|research_search|search_docs|grep|glob|tool_?search|discover/.test(t)) return "search";
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
  next[i] = { ...next[i], ...patch, browser: patch.browser ?? next[i].browser };
  return next;
}

/** Tope de pasos guardados por turno: un turno largo no debe crecer la fila sin límite. */
export const MAX_STEPS = 300;

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
  const { command: _c, detail, browser, ...rest } = s;
  const out: AgentStep = { ...rest };
  if (s.kind === "editor" && detail) out.detail = detail.split("/").pop();
  if (browser) {
    const { sessionId: _s, ...b } = browser;
    out.browser = { ...b, url: bareUrl(b.url) };
  }
  return out;
}
