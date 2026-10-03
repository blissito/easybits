import { describe, it, expect } from "vitest";
import {
  createKeyStore,
  blobToRows,
  rowsToBlob,
  loadOrMigrate,
  META_TYPE,
  META_MIGRATED,
  type KeyBackend,
  type KeyRow,
} from "~/.server/integrations/whatsapp/authKeyStore.server";

// Backend falso: la "colección" es un Map y el blob legacy un campo aparte.
function fakeBackend(blob: unknown = null, rows: KeyRow[] = []) {
  const coll = new Map<string, KeyRow>();
  for (const r of rows) coll.set(`${r.type}|${r.keyId}`, r);
  const calls = { upserts: [] as KeyRow[][], removes: [] as number[], blobWrites: 0, failNext: 0 };
  const state = { blob };
  const backend: KeyBackend = {
    async loadRows() {
      return [...coll.values()];
    },
    async loadLegacyBlob() {
      return state.blob;
    },
    async upsert(_id, rs) {
      if (calls.failNext > 0) {
        calls.failNext--;
        throw new Error("boom");
      }
      calls.upserts.push(rs);
      for (const r of rs) coll.set(`${r.type}|${r.keyId}`, r);
    },
    async remove(_id, refs) {
      calls.removes.push(refs.length);
      for (const r of refs) coll.delete(`${r.type}|${r.keyId}`);
    },
    async removeAll() {
      coll.clear();
    },
    async writeLegacyBlob(_id, b) {
      calls.blobWrites++;
      state.blob = b;
    },
  };
  return { backend, coll, calls, state };
}

const id = (o: unknown) => JSON.parse(JSON.stringify(o));
const opts = { ser: id, de: id, mirror: false, migrate: true, debounceMs: 5 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const legacy = {
  "pre-key": { "1": { pub: "a" }, "2": null, "3": { pub: "c" } },
  session: { "x.0": { s: 1 } },
};

describe("authKeyStore: migración desde el blob legacy", () => {
  it("copia las llaves sin los null y deja el marcador", async () => {
    const f = fakeBackend(legacy);
    const rows = await loadOrMigrate("fa", f.backend);
    expect(rows).toHaveLength(3);
    expect(f.coll.has(`${META_TYPE}|${META_MIGRATED}`)).toBe(true);
    expect(f.coll.has("pre-key|2")).toBe(false);
  });

  it("con marcador, la colección manda y el blob se ignora", async () => {
    const f = fakeBackend(legacy, [
      { type: "session", keyId: "y", value: { s: 9 } },
      { type: META_TYPE, keyId: META_MIGRATED, value: {} },
    ]);
    const rows = await loadOrMigrate("fa", f.backend);
    expect(rows).toEqual([{ type: "session", keyId: "y", value: { s: 9 } }]);
  });

  it("sin marcador, las filas de un intento a medias se reemplazan por el blob", async () => {
    const f = fakeBackend(legacy, [{ type: "session", keyId: "viejo", value: { s: 0 } }]);
    await loadOrMigrate("fa", f.backend);
    expect(f.coll.has("session|viejo")).toBe(false);
    expect(f.coll.has("session|x.0")).toBe(true);
  });

  it("agente nuevo sin blob: sólo el marcador", async () => {
    const f = fakeBackend(null);
    expect(await loadOrMigrate("fa", f.backend)).toEqual([]);
    expect([...f.coll.keys()]).toEqual([`${META_TYPE}|${META_MIGRATED}`]);
  });

  it("blob ↔ filas conserva la forma", () => {
    const rows = blobToRows(legacy);
    expect(rowsToBlob(rows)).toEqual({ "pre-key": { "1": { pub: "a" }, "3": { pub: "c" } }, session: { "x.0": { s: 1 } } });
  });
});

describe("authKeyStore: escritura incremental", () => {
  it("get lee lo migrado; set escribe sólo lo que cambió", async () => {
    const f = fakeBackend(legacy);
    const s = await createKeyStore("fa", f.backend, opts);
    expect(s.mode).toBe("collection");
    expect(s.get("pre-key", ["1", "2", "9"])).toEqual({ "1": { pub: "a" } });

    const before = f.calls.upserts.length;
    s.set({ session: { "x.0": { s: 2 } }, "pre-key": { "4": { pub: "d" } } });
    await wait(20);
    expect(f.calls.upserts.length).toBe(before + 1); // una sola escritura por ráfaga
    expect(f.calls.upserts.at(-1)).toHaveLength(2);
    expect(f.coll.get("session|x.0")?.value).toEqual({ s: 2 });
  });

  it("null borra la llave de memoria y de la colección", async () => {
    const f = fakeBackend(legacy);
    const s = await createKeyStore("fa", f.backend, opts);
    s.set({ "pre-key": { "1": null } });
    await s.flush();
    expect(s.get("pre-key", ["1"])).toEqual({});
    expect(f.coll.has("pre-key|1")).toBe(false);
  });

  it("set y luego null en la misma ráfaga: sólo se borra", async () => {
    const f = fakeBackend(null);
    const s = await createKeyStore("fa", f.backend, opts);
    s.set({ session: { z: { s: 1 } } });
    s.set({ session: { z: null } });
    const before = f.calls.upserts.length;
    await s.flush();
    expect(f.calls.upserts.length).toBe(before);
    expect(f.coll.has("session|z")).toBe(false);
  });

  it("si la escritura falla, lo pendiente se reintenta", async () => {
    const f = fakeBackend(null);
    const s = await createKeyStore("fa", f.backend, opts);
    f.calls.failNext = 1;
    s.set({ session: { z: { s: 1 } } });
    await s.flush(); // falla
    expect(f.coll.has("session|z")).toBe(false);
    await wait(20); // reintento programado
    expect(f.coll.get("session|z")?.value).toEqual({ s: 1 });
  });

  it("si la migración falla, corre en modo legacy y escribe el blob como antes", async () => {
    const f = fakeBackend(legacy);
    f.calls.failNext = 1; // el upsert de la migración revienta
    const s = await createKeyStore("fa", f.backend, opts);
    expect(s.mode).toBe("legacy");
    expect(s.get("session", ["x.0"])).toEqual({ "x.0": { s: 1 } });
    s.set({ session: { "x.0": { s: 5 } } });
    await s.flush();
    expect((f.state.blob as any).session["x.0"]).toEqual({ s: 5 });
  });
});

describe("authKeyStore: migración por agente", () => {
  it("fuera de la lista: blob como siempre, la colección no se llena", async () => {
    const f = fakeBackend(legacy);
    const s = await createKeyStore("fa", f.backend, { ...opts, migrate: false });
    expect(s.mode).toBe("legacy");
    expect(f.coll.size).toBe(0);
    s.set({ session: { "x.0": { s: 7 } } });
    await s.flush();
    expect((f.state.blob as any).session["x.0"]).toEqual({ s: 7 });
    expect(f.coll.size).toBe(0);
  });

  it("sacarlo de la lista borra su colección: reactivar re-migra desde el blob fresco", async () => {
    const f = fakeBackend(legacy);
    await createKeyStore("fa", f.backend, opts); // migrado
    expect(f.coll.size).toBeGreaterThan(0);
    const back = await createKeyStore("fa", f.backend, { ...opts, migrate: false }); // rollback
    expect(f.coll.size).toBe(0);
    back.set({ session: { "x.0": { s: 8 } } });
    await back.flush();
    const again = await createKeyStore("fa", f.backend, opts); // reactivado
    expect(again.get("session", ["x.0"])).toEqual({ "x.0": { s: 8 } });
  });
});

describe("authKeyStore: espejo para rollback", () => {
  it("con cambios reescribe el blob; sin cambios no lo toca", async () => {
    const f = fakeBackend(legacy);
    const s = await createKeyStore("fa", f.backend, { ...opts, mirror: true, mirrorEveryMs: 10 });
    await s.flush();
    expect(f.calls.blobWrites).toBe(0); // nada cambió

    s.set({ "pre-key": { "1": null, "5": { pub: "e" } } });
    await s.flush();
    expect(f.calls.blobWrites).toBe(1);
    expect(f.state.blob).toEqual({
      "pre-key": { "3": { pub: "c" }, "5": { pub: "e" } },
      session: { "x.0": { s: 1 } },
    });
  });
});
