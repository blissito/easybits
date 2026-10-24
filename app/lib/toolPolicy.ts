/**
 * Reglas por herramienta de un agente de la flota: permitir, preguntar o negar.
 *
 * Viven en `groupConfigs[cfgId].toolRules` (heredan de `"*"`) y viajan al worker en el
 * `turnEnv` de cada turno (`EB_TOOL_RULES`). El worker decide `allow`/`deny` solo y sólo
 * consulta a la app en `ask`. Misma semántica que los permisos de Claude Code: si alguna regla
 * que coincide niega, se niega; si no, si alguna pregunta, se pregunta; si no, se permite.
 * Sin reglas = todo permitido (los agentes vivos no cambian).
 *
 * ⚠️ Copia exacta en ~/sandbox-host/templates/claude-worker/src/toolPolicy.ts: un cambio aquí
 * va también allá (y rebake del worker).
 */

export type ToolAction = "allow" | "ask" | "deny";
export type ToolRule = { pattern: string; action: ToolAction };

/** Variable del turno con las reglas (JSON). */
export const TOOL_RULES_ENV = "EB_TOOL_RULES";

const ACTIONS = new Set<ToolAction>(["allow", "ask", "deny"]);

/** `mcp__easybits__*_delete`, `Bash`, `mcp__denik__*`: `*` = cualquier cosa, sin mayúsculas. */
export function ruleMatches(pattern: string, tool: string): boolean {
  const re = new RegExp(`^${pattern.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i");
  return re.test(tool);
}

export function decideTool(rules: ToolRule[] | undefined, tool: string): ToolAction {
  if (!rules?.length) return "allow";
  const hit = rules.filter((r) => ruleMatches(r.pattern, tool));
  if (hit.some((r) => r.action === "deny")) return "deny";
  if (hit.some((r) => r.action === "ask")) return "ask";
  return "allow";
}

/** Forma y tamaño saneados: lo que guarda el dueño y lo que llega al worker. */
export function cleanToolRules(v: unknown): ToolRule[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({ pattern: typeof r.pattern === "string" ? r.pattern.trim().slice(0, 120) : "", action: r.action as ToolAction }))
    .filter((r) => r.pattern && /^[\w*.:-]+$/.test(r.pattern) && ACTIONS.has(r.action))
    .slice(0, 100);
}
