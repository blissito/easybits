// Llaves Signal de Baileys: UNA llave = UN documento (colección FleetAgentAuthKey).
//
// Antes vivían todas en el campo Json FleetAgent.authKeys y cada ráfaga de keys.set
// reescribía el blob completo (1.4 MB en agentes con miles de contactos). Además las
// llaves que Baileys borra (valor null) se quedaban guardadas como null, así que el
// blob sólo crecía. Resultado: "write conflict" en saveCreds, 15 s al reconectar y
// cada lectura de la fila arrastrando el blob. Incidente 2026-10-03.
//
// Aquí las llaves siguen en memoria (get síncrono, Baileys se comporta igual que
// antes) y se persisten INCREMENTALES: sólo lo que cambió, y los null se borran.
//
// Migración perezosa, sin ventana de corte: la colección sólo es la fuente de verdad
// cuando existe el marcador (type "__meta", keyId "migrated"). Sin marcador, manda el
// blob legacy: se borran las filas del agente (restos de un intento a medias), se
// copian las del blob y al final se escribe el marcador. Si algo falla, la sesión
// corre en modo legacy (exactamente el comportamiento anterior) y reintenta al
// siguiente connect.
//
// Espejo para rollback (BAILEYS_KEYS_MIRROR, encendido salvo "off"): además se
// reescribe el blob legacy, a lo mucho cada 5 min (son ~1.4 MB, ~15 s contra Atlas),
// para que revertir este código no encuentre un blob congelado.

export type KeyMap = Record<string, Record<string, unknown>>;
export type KeyRow = { type: string; keyId: string; value: unknown };
export type KeyRef = { type: string; keyId: string };

export const META_TYPE = "__meta";
export const META_MIGRATED = "migrated";

/** Persistencia. Los valores viajan YA serializados (BufferJSON) en ambos sentidos. */
export interface KeyBackend {
  loadRows(fleetAgentId: string): Promise<KeyRow[]>;
  loadLegacyBlob(fleetAgentId: string): Promise<unknown | null>;
  upsert(fleetAgentId: string, rows: KeyRow[]): Promise<void>;
  remove(fleetAgentId: string, refs: KeyRef[]): Promise<void>;
  removeAll(fleetAgentId: string): Promise<void>;
  writeLegacyBlob(fleetAgentId: string, blob: unknown): Promise<void>;
}

export interface KeyStoreOptions {
  /** Objeto en memoria → JSON persistible (BufferJSON.replacer). */
  ser: (o: unknown) => unknown;
  /** JSON persistido → objeto en memoria (BufferJSON.reviver). */
  de: (o: unknown) => unknown;
  mirror: boolean;
  /**
   * ¿Este agente usa la colección? false = modo legacy idéntico al anterior (blob).
   * La migración va agente por agente (BAILEYS_KEYS_COLLECTION), no toda la flota de golpe.
   */
  migrate: boolean;
  debounceMs?: number;
  mirrorEveryMs?: number;
  onError?: (what: string, e: unknown) => void;
}

export interface KeyStore {
  mode: "collection" | "legacy";
  get(type: string, ids: string[]): Record<string, unknown>;
  set(data: Record<string, Record<string, unknown>>): void;
  /** Escribe YA lo pendiente (apagado / tests). */
  flush(): Promise<void>;
  /** Para el export: el mapa en memoria con la forma del blob legacy. */
  snapshot(): KeyMap;
}

/** Blob legacy {type:{id:value}} → filas, sin los null (llaves ya borradas). */
export function blobToRows(blob: unknown): KeyRow[] {
  const rows: KeyRow[] = [];
  if (!blob || typeof blob !== "object") return rows;
  for (const [type, bucket] of Object.entries(blob as Record<string, unknown>)) {
    if (!bucket || typeof bucket !== "object") continue;
    for (const [keyId, value] of Object.entries(bucket as Record<string, unknown>)) {
      if (value != null) rows.push({ type, keyId, value });
    }
  }
  return rows;
}

/** Filas → blob legacy (forma del export y del espejo). Ignora el marcador. */
export function rowsToBlob(rows: KeyRow[]): KeyMap {
  const blob: KeyMap = {};
  for (const r of rows) {
    if (r.type === META_TYPE) continue;
    (blob[r.type] ||= {})[r.keyId] = r.value;
  }
  return blob;
}

export function isMigrated(rows: KeyRow[]): boolean {
  return rows.some((r) => r.type === META_TYPE && r.keyId === META_MIGRATED);
}

/**
 * Deja la colección lista y devuelve las filas vigentes (serializadas).
 * Lanza si no pudo — quien llama cae a modo legacy.
 */
export async function loadOrMigrate(
  fleetAgentId: string,
  backend: KeyBackend
): Promise<KeyRow[]> {
  const rows = await backend.loadRows(fleetAgentId);
  if (isMigrated(rows)) return rows.filter((r) => r.type !== META_TYPE);

  const fromBlob = blobToRows(await backend.loadLegacyBlob(fleetAgentId));
  // Sin marcador, el blob manda: las filas que haya son de un intento a medias.
  await backend.removeAll(fleetAgentId);
  if (fromBlob.length) await backend.upsert(fleetAgentId, fromBlob);
  await backend.upsert(fleetAgentId, [
    { type: META_TYPE, keyId: META_MIGRATED, value: { at: new Date().toISOString(), count: fromBlob.length } },
  ]);
  return fromBlob;
}

// Apagado: el drain de SIGTERM escribe lo pendiente del store VIGENTE de cada agente
// (un reconnect reemplaza al anterior; el viejo no debe pisar el espejo con llaves rancias).
const liveStores = new Map<string, KeyStore>();
export async function flushAllKeyStores(): Promise<void> {
  await Promise.all([...liveStores.values()].map((s) => s.flush().catch(() => {})));
}

export async function createKeyStore(
  fleetAgentId: string,
  backend: KeyBackend,
  opts: KeyStoreOptions
): Promise<KeyStore> {
  const debounceMs = opts.debounceMs ?? 600;
  const mirrorEveryMs = opts.mirrorEveryMs ?? 300_000;
  const onError = opts.onError ?? (() => {});

  let mode: KeyStore["mode"] = opts.migrate ? "collection" : "legacy";
  let persisted: KeyRow[] = [];
  if (opts.migrate) {
    try {
      persisted = await loadOrMigrate(fleetAgentId, backend);
    } catch (e) {
      onError("migrate", e);
      mode = "legacy";
    }
  } else {
    // Fuera de la lista: el blob manda. Si el agente estuvo migrado (rollback), se
    // borra su colección —marcador incluido— para que reactivarlo re-migre desde el
    // blob fresco y no desde filas que dejaron de actualizarse.
    await backend.removeAll(fleetAgentId).catch((e) => onError("rollback", e));
  }
  if (mode === "legacy") persisted = blobToRows(await backend.loadLegacyBlob(fleetAgentId));

  const keys: KeyMap = {};
  for (const r of persisted) (keys[r.type] ||= {})[r.keyId] = opts.de(r.value);

  const dirty = new Map<string, KeyRef>();
  const deleted = new Map<string, KeyRef>();
  let timer: NodeJS.Timeout | null = null;
  let mirrorTimer: NodeJS.Timeout | null = null;
  let lastMirrorAt = 0;
  // El espejo sólo se reescribe si hubo cambios desde el último: un store sin
  // tráfico nunca toca el blob.
  let mirrorPending = false;
  let writing: Promise<void> = Promise.resolve();

  const writeBlob = () => backend.writeLegacyBlob(fleetAgentId, opts.ser(keys));

  const writeMirror = async () => {
    if (!mirrorPending) return;
    mirrorPending = false;
    lastMirrorAt = Date.now();
    await writeBlob().catch((e) => onError("mirror", e));
  };
  const scheduleMirror = () => {
    if (!opts.mirror || mode !== "collection" || mirrorTimer) return;
    const wait = Math.max(0, lastMirrorAt + mirrorEveryMs - Date.now());
    mirrorTimer = setTimeout(() => {
      mirrorTimer = null;
      void writeMirror();
    }, wait);
    mirrorTimer.unref?.();
  };

  const writePending = async () => {
    if (mode === "legacy") {
      if (!dirty.size && !deleted.size) return;
      dirty.clear();
      deleted.clear();
      await writeBlob().catch((e) => onError("legacy", e));
      return;
    }
    const ups = [...dirty.values()];
    const dels = [...deleted.values()];
    dirty.clear();
    deleted.clear();
    const rows: KeyRow[] = [];
    for (const r of ups) {
      const v = keys[r.type]?.[r.keyId];
      if (v !== undefined) rows.push({ ...r, value: opts.ser(v) });
    }
    try {
      if (rows.length) await backend.upsert(fleetAgentId, rows);
      if (dels.length) await backend.remove(fleetAgentId, dels);
    } catch (e) {
      // No perder la escritura: lo que falló vuelve a quedar pendiente.
      for (const r of ups) if (!deleted.has(k(r))) dirty.set(k(r), r);
      for (const r of dels) if (!dirty.has(k(r))) deleted.set(k(r), r);
      onError("flush", e);
      schedule();
      return;
    }
    if (rows.length || dels.length) {
      mirrorPending = true;
      scheduleMirror();
    }
  };

  // Serializado: nunca dos escrituras del mismo agente en paralelo (eso era el
  // "write conflict" del blob).
  const flush = () => (writing = writing.then(writePending, writePending));

  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, debounceMs);
    timer.unref?.();
  };

  const store: KeyStore = {
    get mode() {
      return mode;
    },
    get(type, ids) {
      const out: Record<string, unknown> = {};
      for (const id of ids) {
        const v = keys[type]?.[id];
        if (v !== undefined) out[id] = v;
      }
      return out;
    },
    set(data) {
      for (const type in data) {
        for (const keyId in data[type]) {
          const value = data[type][keyId];
          const ref = { type, keyId };
          if (value == null) {
            if (keys[type]) delete keys[type][keyId];
            dirty.delete(k(ref));
            deleted.set(k(ref), ref);
          } else {
            (keys[type] ||= {})[keyId] = value;
            deleted.delete(k(ref));
            dirty.set(k(ref), ref);
          }
        }
      }
      schedule();
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await flush();
      if (opts.mirror && mode === "collection") {
        if (mirrorTimer) {
          clearTimeout(mirrorTimer);
          mirrorTimer = null;
        }
        await writeMirror();
      }
    },
    snapshot() {
      return keys;
    },
  };
  liveStores.set(fleetAgentId, store);
  return store;
}

const k = (r: KeyRef) => `${r.type}\u0000${r.keyId}`;

// ── Backend Mongo ─────────────────────────────────────────────────────────────
// Por $runCommandRaw y no por el cliente Prisma: un lote de N upserts es UN comando
// (Prisma haría N viajes o una transacción), y el Json de Prisma es lento de parsear
// en miles de filas. La salida de runCommandRaw es EJSON relajado: números planos,
// fechas como {$date} — en las llaves no hay fechas, los Buffers ya vienen en
// base64 por BufferJSON. Las fechas que escribimos van como {$date} (gotcha P2023).
const COLL = "FleetAgentAuthKey";
const PAGE = 1000;
const BATCH = 500;

const oid = (id: string) => ({ $oid: id });
const chunks = <T,>(xs: T[], n: number) => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};
// Un error de escritura NO lanza en runCommandRaw: viene en writeErrors.
const check = (res: unknown, what: string) => {
  const r = res as { ok?: number; writeErrors?: unknown[] };
  if (r?.ok !== 1 || (r.writeErrors && r.writeErrors.length)) {
    throw new Error(`${what}: ${JSON.stringify(r?.writeErrors ?? r).slice(0, 300)}`);
  }
};

export function mongoKeyBackend(db: { $runCommandRaw: (cmd: any) => Promise<unknown> }): KeyBackend {
  return {
    async loadRows(fleetAgentId) {
      // Paginado por _id con singleBatch: nunca depende de getMore (el cursor id es
      // int64 y en EJSON relajado pierde precisión).
      const rows: KeyRow[] = [];
      let after: unknown = null;
      for (;;) {
        const filter: Record<string, unknown> = { fleetAgentId: oid(fleetAgentId) };
        if (after) filter._id = { $gt: after };
        const res = (await db.$runCommandRaw({
          find: COLL,
          filter,
          projection: { type: 1, keyId: 1, value: 1 },
          sort: { _id: 1 },
          limit: PAGE,
          batchSize: PAGE,
          singleBatch: true,
        })) as { cursor?: { firstBatch?: Array<{ _id: unknown; type: string; keyId: string; value: unknown }> } };
        const batch = res.cursor?.firstBatch ?? [];
        for (const d of batch) rows.push({ type: d.type, keyId: d.keyId, value: d.value });
        if (batch.length < PAGE) return rows;
        after = batch[batch.length - 1]._id;
      }
    },
    async loadLegacyBlob(fleetAgentId) {
      const res = (await db.$runCommandRaw({
        find: "FleetAgent",
        filter: { _id: oid(fleetAgentId) },
        projection: { authKeys: 1 },
        limit: 1,
        singleBatch: true,
      })) as { cursor?: { firstBatch?: Array<{ authKeys?: unknown }> } };
      return res.cursor?.firstBatch?.[0]?.authKeys ?? null;
    },
    async upsert(fleetAgentId, rows) {
      const now = { $date: new Date().toISOString() };
      for (const part of chunks(rows, BATCH)) {
        const res = await db.$runCommandRaw({
          update: COLL,
          ordered: false,
          updates: part.map((r) => ({
            q: { fleetAgentId: oid(fleetAgentId), type: r.type, keyId: r.keyId },
            u: { $set: { value: r.value, updatedAt: now } },
            upsert: true,
          })),
        });
        check(res, "authKeys upsert");
      }
    },
    async remove(fleetAgentId, refs) {
      for (const part of chunks(refs, BATCH)) {
        const res = await db.$runCommandRaw({
          delete: COLL,
          ordered: false,
          deletes: part.map((r) => ({
            q: { fleetAgentId: oid(fleetAgentId), type: r.type, keyId: r.keyId },
            limit: 1,
          })),
        });
        check(res, "authKeys delete");
      }
    },
    async removeAll(fleetAgentId) {
      const res = await db.$runCommandRaw({
        delete: COLL,
        deletes: [{ q: { fleetAgentId: oid(fleetAgentId) }, limit: 0 }],
      });
      check(res, "authKeys deleteAll");
    },
    async writeLegacyBlob(fleetAgentId, blob) {
      const res = await db.$runCommandRaw({
        update: "FleetAgent",
        updates: [{ q: { _id: oid(fleetAgentId) }, u: { $set: { authKeys: blob } } }],
      });
      check(res, "authKeys mirror");
    },
  };
}

/** Borra TODAS las llaves de un agente (logout / borrado del agente). */
export async function deleteAgentKeys(
  db: { $runCommandRaw: (cmd: any) => Promise<unknown> },
  fleetAgentId: string
): Promise<void> {
  await mongoKeyBackend(db).removeAll(fleetAgentId);
}

/** Para el export: llaves vigentes con la forma del blob legacy (serializadas). */
export async function readAgentKeysBlob(
  db: { $runCommandRaw: (cmd: any) => Promise<unknown> },
  fleetAgentId: string
): Promise<unknown> {
  const backend = mongoKeyBackend(db);
  const rows = await backend.loadRows(fleetAgentId);
  if (isMigrated(rows)) return rowsToBlob(rows);
  return backend.loadLegacyBlob(fleetAgentId);
}
