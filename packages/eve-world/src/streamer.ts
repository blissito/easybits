import { EventEmitter } from 'node:events';
import type { Streamer } from '@workflow/world';
import { and, asc, eq, gt, lt, sql } from 'drizzle-orm';
import { monotonicFactory } from 'ulid';
import { type Drizzle, Schema } from './drizzle/index.js';

type ChunkMsg = { id: string; data: Buffer; eof: boolean };

/**
 * Streamer sobre la tabla de chunks. Sin NOTIFY: los lectores del mismo
 * proceso se despiertan por emitter y todos los lectores además sondean la
 * tabla cada `pollMs` mientras el stream siga abierto, para ver chunks que
 * escribió otro proceso contra el mismo sqld.
 */
export function createStreamer(drizzle: Drizzle, options: { pollMs: number }): Streamer & { close(): Promise<void> } {
  const ulid = monotonicFactory();
  const events = new EventEmitter();
  events.setMaxListeners(0);
  const { streams } = Schema;
  const genChunkId = () => `chnk_${ulid()}` as const;
  const activeReaders = new Set<() => void>();
  let closed = false;
  const streamerClosedError = () => new Error('Cannot read stream: the libSQL streamer has been closed');

  const toBuffer = (chunk: string | Uint8Array) => (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));

  const loadPersistedChunks = (name: string, after?: string) =>
    drizzle
      .select({ id: streams.chunkId, eof: streams.eof, data: streams.chunkData })
      .from(streams)
      .where(and(eq(streams.streamId, name), after ? gt(streams.chunkId, after) : undefined))
      .orderBy(asc(streams.chunkId));

  // Primer EOF: lo que venga después (reintento de un cierre) se ignora.
  const findFirstEofChunkId = async (name: string) => {
    const [row] = await drizzle
      .select({ chunkId: streams.chunkId })
      .from(streams)
      .where(and(eq(streams.streamId, name), eq(streams.eof, true)))
      .orderBy(asc(streams.chunkId))
      .limit(1);
    return row?.chunkId ?? null;
  };

  const emit = (name: string, msg: ChunkMsg) => {
    events.emit(`strm:${name}`, msg);
  };

  const decodeCursor = (cursor?: string): { c?: string; i?: number } => {
    if (!cursor) return {};
    try {
      return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
    } catch {
      return {};
    }
  };

  return {
    streams: {
      async write(_runId, name, chunk) {
        const runId = await _runId;
        const chunkId = genChunkId();
        const data = toBuffer(chunk);
        await drizzle.insert(streams).values({ chunkId, streamId: name, runId, chunkData: data, eof: false });
        emit(name, { id: chunkId, data, eof: false });
      },
      async writeMulti(_runId, name, chunks) {
        if (chunks.length === 0) return;
        const rows = chunks.map((chunk) => ({ chunkId: genChunkId(), streamId: name, runId: undefined as string | undefined, chunkData: toBuffer(chunk), eof: false }));
        const runId = await _runId;
        for (const r of rows) r.runId = runId;
        await drizzle.insert(streams).values(rows);
        for (const r of rows) emit(name, { id: r.chunkId, data: r.chunkData, eof: false });
      },
      async close(_runId, name) {
        const runId = await _runId;
        const chunkId = genChunkId();
        await drizzle.insert(streams).values({ chunkId, streamId: name, runId, chunkData: Buffer.alloc(0), eof: true });
        emit(name, { id: chunkId, data: Buffer.alloc(0), eof: true });
      },
      async getChunks(_runId, name, options) {
        const limit = options?.limit ?? 100;
        const cursor = decodeCursor(options?.cursor);
        const firstEofChunkId = await findFirstEofChunkId(name);
        const rows = await drizzle
          .select({ chunkId: streams.chunkId, data: streams.chunkData })
          .from(streams)
          .where(
            and(
              eq(streams.streamId, name),
              eq(streams.eof, false),
              firstEofChunkId ? lt(streams.chunkId, firstEofChunkId) : undefined,
              cursor.c ? gt(streams.chunkId, cursor.c) : undefined
            )
          )
          .orderBy(asc(streams.chunkId))
          .limit(limit + 1);
        const hasMore = rows.length > limit;
        const pageRows = rows.slice(0, limit);
        const baseIndex = typeof cursor.i === 'number' ? cursor.i : 0;
        const chunks = pageRows.map((row, i) => ({ index: baseIndex + i, data: new Uint8Array(row.data) }));
        const nextCursor =
          hasMore && pageRows.length > 0
            ? Buffer.from(JSON.stringify({ c: pageRows[pageRows.length - 1].chunkId, i: baseIndex + pageRows.length })).toString('base64')
            : null;
        return { data: chunks, cursor: nextCursor, hasMore, done: firstEofChunkId !== null };
      },
      async getInfo(_runId, name) {
        const firstEofChunkId = await findFirstEofChunkId(name);
        const [countResult] = await drizzle
          .select({ count: sql<number>`count(*)` })
          .from(streams)
          .where(and(eq(streams.streamId, name), eq(streams.eof, false), firstEofChunkId ? lt(streams.chunkId, firstEofChunkId) : undefined));
        return { tailIndex: Number(countResult?.count ?? 0) - 1, done: firstEofChunkId !== null };
      },
      async get(_runId, name, startIndex) {
        if (closed) throw streamerClosedError();
        const cleanups: Array<() => void> = [];
        let cleanedUp = false;
        const cleanup = () => {
          if (cleanedUp) return;
          cleanedUp = true;
          activeReaders.delete(abort);
          cleanups.forEach((fn) => void fn());
        };
        let controller!: ReadableStreamDefaultController<Uint8Array>;
        const abort = () => {
          cleanup();
          controller.error(streamerClosedError());
        };
        activeReaders.add(abort);
        return new ReadableStream<Uint8Array>({
          async start(ctrl) {
            controller = ctrl;
            let lastChunkId = '';
            let offset = startIndex ?? 0;
            let buffer: ChunkMsg[] | null = [];
            function enqueue(msg: ChunkMsg) {
              if (cleanedUp) return;
              if (lastChunkId >= msg.id) return;
              lastChunkId = msg.id;
              // El EOF no cuenta para el offset.
              if (offset > 0 && !msg.eof) {
                offset--;
                return;
              }
              if (msg.data.byteLength) controller.enqueue(new Uint8Array(msg.data));
              if (msg.eof) {
                cleanup();
                controller.close();
              }
            }
            function onData(data: ChunkMsg) {
              if (buffer) {
                buffer.push(data);
                return;
              }
              enqueue(data);
            }
            events.on(`strm:${name}`, onData);
            cleanups.push(() => events.off(`strm:${name}`, onData));
            const chunks = await loadPersistedChunks(name).catch((err) => {
              cleanup();
              throw err;
            });
            if (typeof offset === 'number' && offset < 0) {
              const firstEof = chunks.findIndex((c) => c.eof);
              const dataCount = firstEof === -1 ? chunks.length : firstEof;
              offset = Math.max(0, dataCount + offset);
            }
            for (const chunk of [...chunks, ...(buffer ?? [])]) enqueue(chunk);
            buffer = null;
            // Sondeo de respaldo para escritores en otro proceso.
            let polling = false;
            const timer = setInterval(async () => {
              if (cleanedUp || polling) return;
              polling = true;
              try {
                const fresh = await loadPersistedChunks(name, lastChunkId);
                for (const c of fresh) enqueue(c);
              } catch {
                // se reintenta en el siguiente tick
              } finally {
                polling = false;
              }
            }, options.pollMs);
            timer.unref?.();
            cleanups.push(() => clearInterval(timer));
          },
          cancel() {
            cleanup();
          },
        });
      },
      async list(runId) {
        const results = await drizzle.selectDistinct({ streamId: streams.streamId }).from(streams).where(eq(streams.runId, runId));
        return results.map((r) => r.streamId);
      },
    },
    async close() {
      closed = true;
      for (const abort of [...activeReaders]) abort();
      events.removeAllListeners();
    },
  };
}
