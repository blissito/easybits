// null de SQL → undefined, para que los schemas zod con .optional() acepten la fila.
export function compact<T extends object>(obj: T): { [K in keyof T]: Exclude<T[K], null> | undefined } {
  const value: Record<string, unknown> = {};
  for (const key in obj) {
    value[key] = obj[key] === null ? undefined : obj[key];
  }
  return value as { [K in keyof T]: Exclude<T[K], null> | undefined };
}

export function map<T, R>(obj: T | undefined | null, fn: (v: T) => R): R | undefined {
  return obj ? fn(obj) : undefined;
}

export class Mutex {
  private promise: Promise<unknown> = Promise.resolve();
  andThen<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.promise.then(() => fn(), () => fn());
    this.promise = next;
    return next;
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

/** El error de libsql detrás del wrapper de drizzle, o el mismo error. */
export function sqliteErrorOf(err: unknown): { code?: string; message?: string } {
  const e = err as { code?: string; message?: string; cause?: unknown };
  if (e && typeof e === 'object' && 'cause' in e && e.cause && typeof e.cause === 'object') {
    return e.cause as { code?: string; message?: string };
  }
  return e ?? {};
}

export function isUniqueViolation(err: unknown, ...columns: string[]): boolean {
  const { message = '' } = sqliteErrorOf(err);
  const outer = String((err as Error)?.message ?? '');
  const text = `${message}\n${outer}`;
  if (!text.includes('UNIQUE constraint failed')) return false;
  return columns.every((c) => text.includes(c));
}
