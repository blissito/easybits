import { FleetAgentAtCapacity, admitRetryDelay } from "./fleetAgentOperations";

/**
 * Reintento acotado ante saturación, para las superficies HTTP.
 *
 * Baileys ya RETIENE la ráfaga y reintenta con backoff hasta ~4 min, así que una
 * saturación transitoria nunca pierde un mensaje de WhatsApp. Las superficies HTTP, en
 * cambio, devolvían 503 de inmediato y el turno se perdía — justo el camino que usan
 * WABA (el de más volumen) y un widget embebido.
 *
 * La ventana es deliberadamente corta comparada con la de Baileys: al otro lado hay una
 * petición HTTP abierta (Meta corta ~30s), así que se espera lo justo para cubrir el
 * caso común —el reaper duerme una caja ociosa y el desalojo la reclama— y si no, se
 * responde 503 con `Retry-After` para que el cliente reintente.
 */
export const HTTP_ADMIT_WINDOW_MS = 25_000;

export async function withAdmitRetry<T>(
  run: () => Promise<T>,
  opts?: { windowMs?: number; onRetry?: (attempt: number, waitMs: number) => void }
): Promise<T> {
  const windowMs = opts?.windowMs ?? HTTP_ADMIT_WINDOW_MS;
  const deadline = Date.now() + windowMs;
  let attempt = 0;

  for (;;) {
    try {
      return await run();
    } catch (e) {
      if (!(e instanceof FleetAgentAtCapacity)) throw e;
      // "ram" = ningún fierro tiene sitio; esperar no lo arregla en 25s.
      if (e.reason === "ram") throw e;
      const wait = admitRetryDelay(attempt);
      if (Date.now() + wait >= deadline) throw e;
      opts?.onRetry?.(attempt, wait);
      await new Promise((r) => setTimeout(r, wait));
      attempt++;
    }
  }
}
