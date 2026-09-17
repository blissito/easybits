import { EventEmitter } from 'node:events';
import { envNumber } from '@workflow/world';

/**
 * Despertador de `runs.waitForTerminalStatus`. libSQL no tiene LISTEN/NOTIFY,
 * así que la señal es un emitter en proceso (rápido para quien escribe y
 * espera en el mismo proceso) y el respaldo es la relectura periódica, que
 * acota a un intervalo lo que tarda en notarse una transición hecha desde
 * otro proceso.
 */
export interface RunStatusSignal {
  notify(runId: string): void;
  wait(runId: string, timeoutMs: number, signal?: AbortSignal): Promise<void>;
  close(): Promise<void>;
}

const RUN_STATUS_POLL_INTERVAL_MS = 1_000;

export function getRunStatusPollIntervalMs() {
  return envNumber('WORKFLOW_RUN_STATUS_POLL_INTERVAL_MS', RUN_STATUS_POLL_INTERVAL_MS, { integer: true, min: 1 });
}

export function createRunStatusSignal(): RunStatusSignal {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  return {
    notify(runId) {
      emitter.emit(`run:${runId}`);
    },
    async wait(runId, timeoutMs, signal) {
      if (timeoutMs <= 0 || signal?.aborted) return;
      const key = `run:${runId}`;
      await new Promise<void>((resolve) => {
        let settled = false;
        const settle = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          emitter.off(key, settle);
          signal?.removeEventListener('abort', settle);
          resolve();
        };
        // Se deja ref'd a propósito: puede ser lo único que mantiene vivo el loop.
        const timer = setTimeout(settle, timeoutMs);
        emitter.once(key, settle);
        signal?.addEventListener('abort', settle, { once: true });
      });
    },
    async close() {
      emitter.removeAllListeners();
    },
  };
}
