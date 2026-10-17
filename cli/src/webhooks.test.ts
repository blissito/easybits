import { test } from "node:test";
import assert from "node:assert/strict";
import { eventList, matchKey, scopeList } from "./commands/webhooks.ts";

test("eventList: repetido o separado por comas, sin repetidos ni vacíos", () => {
  assert.deepEqual(eventList(["file.created", "file.deleted, file.created", ""]), ["file.created", "file.deleted"]);
  assert.deepEqual(eventList([]), []);
});

test("scopeList: mayúsculas, sin repetidos; vacío = default de la API", () => {
  assert.deepEqual(scopeList("read, Write,READ"), ["READ", "WRITE"]);
  assert.equal(scopeList(undefined), undefined);
  assert.equal(scopeList(" , "), undefined);
});

const keys = [
  { id: "k1", name: "ci", prefix: "eb_sk_live_aaaaaaaa", status: "ACTIVE" },
  { id: "k2", name: "CI", prefix: "eb_sk_live_bbbbbbbb", status: "REVOKED" },
  { id: "k3", name: "dash", prefix: "eb_sk_live_cccccccc", status: "ACTIVE" },
  { id: "k4", name: "dash", prefix: "eb_sk_live_dddddddd", status: "ACTIVE" },
];

test("matchKey: id, prefijo o nombre (ignora las revocadas)", () => {
  assert.deepEqual(matchKey("k3", keys), { id: "k3" });
  assert.deepEqual(matchKey("eb_sk_live_aaaaaaaa", keys), { id: "k1" });
  assert.deepEqual(matchKey("Ci", keys), { id: "k1" });
});

test("matchKey: nombre repetido = ambiguo; nada = lista vacía", () => {
  const r = matchKey("dash", keys);
  assert.ok("matches" in r && r.matches.length === 2);
  assert.deepEqual(matchKey("nope", keys), { matches: [] });
});
