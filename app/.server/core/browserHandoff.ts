// El agente pidió ayuda a la persona (`browser_ask_human` del MCP render): su llamada se queda
// esperando aquí, con el turno vivo (así la persona puede tomar el control), y la suelta el
// «Devolver el control» del proxy (`sites.$id.takeover.$pass.$op` → release). Mismo patrón que
// cloud-browser-live.server.ts de Ghosty Studio.
//
// En memoria del proceso: el turno de Sitios y su proxy viven en la misma instancia (la del
// lease de turnos). Si un deploy azul/verde los separa, la espera termina por tiempo y el agente
// vuelve a preguntar, sin quedarse colgado.
const waiters = new Map<string, Set<() => void>>();

/** true = la persona devolvió el control; false = se acabó el tiempo. */
export function waitForRelease(sessionId: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const set = waiters.get(sessionId) ?? new Set();
    const done = (ok: boolean) => {
      clearTimeout(timer);
      set.delete(wake);
      if (!set.size) waiters.delete(sessionId);
      resolve(ok);
    };
    const wake = () => done(true);
    const timer = setTimeout(() => done(false), ms);
    set.add(wake);
    waiters.set(sessionId, set);
  });
}

/** La persona devolvió el control de esa sesión. */
export function releaseHandoff(sessionId: string): void {
  for (const wake of [...(waiters.get(sessionId) ?? [])]) wake();
}
