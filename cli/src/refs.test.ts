import { test } from "node:test";
import assert from "node:assert/strict";
import { REF_ARGS, looksLikeId, matchRef } from "./refs.ts";

const agents = [
  { id: "6aacca8fbc0c2632b7a10603", name: "Ghosty", status: "running" },
  { id: "6aacca5cbc0c2632b7a105fd", name: "Ghosty", status: "lost" },
  { id: "6a9ac164ec6ea4504a1eedb0", name: "mi-agente-v2", status: "running" },
];
const boxes = [
  { id: "sb_2050d840-d6e9-40c6-b045-91025d47506e", name: "normi035" },
  { id: "sb_f4ca413b-bf7f-4ac9-a748-f6becf11b3fa", name: "bitacora-normi035" },
];

test("un id con formato pasa directo, sin lista", () => {
  assert.deepEqual(matchRef("agent", "6650f0c2a1b2c3d4e5f60718", null), { ok: true, id: "6650f0c2a1b2c3d4e5f60718" });
  assert.deepEqual(matchRef("sandbox", "sb_abc-123", null), { ok: true, id: "sb_abc-123" });
  assert.equal(looksLikeId("db", "leads"), false);
  assert.equal(looksLikeId("sandbox", "6650f0c2a1b2c3d4e5f60718"), false);
});

test("nombre exacto, sin distinguir mayúsculas", () => {
  assert.deepEqual(matchRef("agent", "MI-AGENTE-V2", agents), { ok: true, id: "6a9ac164ec6ea4504a1eedb0" });
  assert.deepEqual(matchRef("sandbox", "normi035", boxes), { ok: true, id: "sb_2050d840-d6e9-40c6-b045-91025d47506e" });
});

test("nunca por prefijo ni subcadena", () => {
  assert.deepEqual(matchRef("sandbox", "normi", boxes), { ok: false, reason: "not_found" });
  assert.deepEqual(matchRef("agent", "mi-agente", agents), { ok: false, reason: "not_found" });
});

test("ambiguo: devuelve todos los que empatan", () => {
  const r = matchRef("agent", "ghosty", agents);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "ambiguous");
  assert.equal(!r.ok && r.reason === "ambiguous" && r.matches.length, 2);
});

test("inexistente", () => {
  assert.deepEqual(matchRef("db", "nada", []), { ok: false, reason: "not_found" });
});

test("la tabla sólo apunta a tipos conocidos", () => {
  for (const [key, spec] of Object.entries(REF_ARGS)) {
    assert.match(key, /^[a-z]+ [a-z]+$/);
    assert.ok(["agent", "sandbox", "db"].includes(spec.kind), key);
    assert.ok(spec.index >= 0 && spec.index <= 1, key);
  }
});
