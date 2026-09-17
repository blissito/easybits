import { readRunRetention } from '@workflow/world';
import { eq, sql } from 'drizzle-orm';
import { type Drizzle, Schema } from './drizzle/index.js';

// NULL de SQL, no un `null` codificado en CBOR: así la columna queda vacía de verdad.
const NULL = sql`NULL`;

/**
 * Borra los datos de usuario de un run terminado con `$retention: 0` y sella
 * `expired_at`. Las filas se quedan (el run sigue listable); los chunks de
 * stream se vacían en vez de borrarse para que el lector siga cerrando en EOF.
 */
export async function purgeRunUserData(drizzle: Drizzle, runId: string, purgedAt: Date) {
  const { runs, steps, events, hooks, streams } = Schema;
  await drizzle.transaction(async (tx) => {
    await tx
      .update(runs)
      .set({ expiredAt: purgedAt, input: NULL as never, output: NULL as never, error: NULL as never })
      .where(eq(runs.runId, runId));
    await tx.update(steps).set({ input: NULL as never, output: NULL as never, error: NULL as never }).where(eq(steps.runId, runId));
    await tx.update(events).set({ eventData: NULL as never }).where(eq(events.runId, runId));
    await tx.update(hooks).set({ metadata: NULL as never, resumeContext: NULL as never }).where(eq(hooks.runId, runId));
    await tx.update(streams).set({ chunkData: Buffer.alloc(0) }).where(eq(streams.runId, runId));
  });
}

/** Nunca lanza: un run debe terminar aunque su purga falle. */
export async function purgeRunUserDataIfZeroRetention(
  drizzle: Drizzle,
  runId: string,
  attributes: Record<string, string> | undefined,
  purgedAt = new Date()
) {
  const retention = readRunRetention(attributes);
  if (retention.unsupported) {
    console.warn(
      `[workflow] run "${runId}" requested retention "${retention.raw}", ` +
        (retention.wellFormed ? 'a duration this World cannot scale yet (only "0" is implemented)' : 'which this World does not recognize') +
        '; keeping the data.'
    );
  }
  if (retention.mode !== 'none') return;
  try {
    await purgeRunUserData(drizzle, runId, purgedAt);
  } catch (cause) {
    console.error(`[workflow] failed to purge user data for zero-retention run "${runId}"`, cause);
  }
}
