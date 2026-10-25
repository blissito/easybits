// El agente pidió ayuda a la persona (`browser_ask_human` del MCP render): su llamada se queda
// esperando aquí, con el turno vivo (así la persona puede tomar el control), y la suelta el
// «Devolver el control» del proxy (`sites.$id.takeover.$pass.$op` → release). Mismo patrón que
// cloud-browser-live.server.ts de Ghosty Studio.
//
// En memoria del proceso: el turno de Sitios y su proxy viven en la misma instancia (la del
// lease de turnos). Si un deploy azul/verde los separa, la espera termina por tiempo y el agente
// vuelve a preguntar, sin quedarse colgado.
const waiters = new Map<string, Set<() => void>>();

/** true = la persona devolvió el control o contestó; false = se acabó el tiempo o `stop`. */
export function waitForRelease(sessionId: string, ms: number, stop?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const set = waiters.get(sessionId) ?? new Set();
    const done = (ok: boolean) => {
      clearTimeout(timer);
      stop?.removeEventListener("abort", onStop);
      set.delete(wake);
      if (!set.size) waiters.delete(sessionId);
      resolve(ok);
    };
    const wake = () => done(true);
    const onStop = () => done(false);
    const timer = setTimeout(() => done(false), ms);
    stop?.addEventListener("abort", onStop);
    set.add(wake);
    waiters.set(sessionId, set);
    if (stop?.aborted) done(false);
  });
}

/** La persona devolvió el control de esa sesión. */
export function releaseHandoff(sessionId: string): void {
  humanHolds.delete(sessionId);
  for (const wake of [...(waiters.get(sessionId) ?? [])]) wake();
}

// ── La persona tiene el control ────────────────────────────────────────────────────────────
// Con la persona al mando, `browser_close` no cierra: le cerraría el navegador en la cara.
// Vence con el pase de la toma: una pestaña cerrada sin «Devolver» no lo deja bloqueado.
const humanHolds = new Map<string, number>();

/** Se le dio el control a la persona (`sites.$id.takeover`) por `ms`. */
export function holdHandoff(sessionId: string, ms: number): void {
  humanHolds.set(sessionId, Date.now() + ms);
  if (humanHolds.size > 500) humanHolds.delete(humanHolds.keys().next().value!);
}

export function humanHasControl(sessionId: string): boolean {
  return (humanHolds.get(sessionId) ?? 0) > Date.now();
}

// ── La persona contesta el pedido de ayuda sin tomar el control ────────────────────────────
// Puede escribir en el chat («llénala tú», «déjalo») o tocar «Hazlo tú» / «Cancelar» en la
// tarjeta: la espera se suelta con su respuesta y el agente sigue en el mismo turno.
export type HumanAnswer = { answered: "message"; text: string } | { answered: "delegate" } | { answered: "cancel" };
/** Pedido de ayuda abierto por conversación (groupId → sesión del navegador). */
const openAsks = new Map<string, string>();
const answers = new Map<string, HumanAnswer>();

/** `browser_ask_human` empezó a esperar en esa conversación. */
export function openHumanAsk(groupId: string, sessionId: string): void {
  openAsks.set(groupId, sessionId);
  if (openAsks.size > 500) openAsks.delete(openAsks.keys().next().value!);
}

/** La espera terminó (respuesta, devolución, tiempo o turno detenido). */
export function closeHumanAsk(groupId: string, sessionId: string): void {
  if (openAsks.get(groupId) === sessionId) openAsks.delete(groupId);
  answers.delete(sessionId);
}

/** La persona contestó el pedido de esa sesión. false = nadie esperaba (ya terminó o vive en otra instancia). */
export function answerHumanAsk(groupId: string, sessionId: string, answer: HumanAnswer): boolean {
  if (openAsks.get(groupId) !== sessionId) return false;
  answers.set(sessionId, answer);
  for (const wake of [...(waiters.get(sessionId) ?? [])]) wake();
  return true;
}

/** Lo mismo desde el chat: el mensaje que la persona escribió con el agente esperándola. */
export function answerHumanAskForGroup(groupId: string, answer: HumanAnswer): boolean {
  const sessionId = openAsks.get(groupId);
  return sessionId ? answerHumanAsk(groupId, sessionId, answer) : false;
}

/** La respuesta pendiente de esa sesión, si la hay (se consume al leerla). */
export function takeHumanAnswer(sessionId: string): HumanAnswer | undefined {
  const a = answers.get(sessionId);
  answers.delete(sessionId);
  return a;
}
