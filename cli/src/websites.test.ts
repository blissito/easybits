import { test } from "node:test";
import assert from "node:assert/strict";
import { matchWebsite } from "./commands/account.ts";

const items = [
  { id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Tienda", slug: "mi-tienda", url: "" },
  { id: "bbbbbbbbbbbbbbbbbbbbbbbb", name: "Docs", slug: "rio-durmiente", url: "" },
];

test("un id de 24 hex pasa directo", () => {
  assert.equal(matchWebsite("cccccccccccccccccccccccc", items), "cccccccccccccccccccccccc");
});

test("un slug se resuelve a su id (sin importar mayúsculas)", () => {
  assert.equal(matchWebsite("Rio-Durmiente", items), "bbbbbbbbbbbbbbbbbbbbbbbb");
});

test("un slug que no existe da null", () => {
  assert.equal(matchWebsite("no-existe", items), null);
});
