import { test } from "node:test";
import assert from "node:assert/strict";
import { extractInput, organicResults } from "./commands/web.ts";

test("organicResults: SERP con organic[] (link o url), numerado y sin vacíos", () => {
  const r = organicResults({ organic: [{ title: " A ", link: "https://a.com" }, { title: "sin link" }, { title: "B", url: "https://b.com" }] });
  assert.deepEqual(r, [
    { rank: 1, title: "A", url: "https://a.com" },
    { rank: 3, title: "B", url: "https://b.com" },
  ]);
  assert.deepEqual(organicResults(null), []);
  assert.deepEqual(organicResults({ knowledge: {} }), []);
});

test("extractInput: --url repetido arma [{url}]", () => {
  assert.deepEqual(extractInput(undefined, ["https://a", "https://b"], "u"), [{ url: "https://a" }, { url: "https://b" }]);
});

test("extractInput: --input JSON (objeto o arreglo)", () => {
  assert.deepEqual(extractInput('{"query":"iphone"}', [], "u"), { query: "iphone" });
  assert.deepEqual(extractInput('[{"keyword":"x","country":"MX"}]', [], "u"), [{ keyword: "x", country: "MX" }]);
});

test("extractInput: errores de uso (nada, ambos, JSON malo o escalar)", () => {
  assert.throws(() => extractInput(undefined, [], "u"), /--input/);
  assert.throws(() => extractInput("{}", ["https://a"], "u"), /not both|no ambos/);
  assert.throws(() => extractInput("{no", [], "u"), /JSON/);
  assert.throws(() => extractInput("3", [], "u"), /JSON/);
});
