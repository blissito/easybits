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

test("organicResults: forma nueva results[] con position y url", () => {
  const r = organicResults([{ position: 1, title: "A", url: "https://a.com" }, { position: 2, title: "B", url: "https://b.com" }]);
  assert.deepEqual(r, [
    { rank: 1, title: "A", url: "https://a.com" },
    { rank: 2, title: "B", url: "https://b.com" },
  ]);
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

test("formatResults: lista que no se rompe en terminal angosta", async () => {
  const { formatResults } = await import("./commands/web.ts");
  const out = formatResults(organicResults([{ position: 1, title: "Ghostty is a fast, feature-rich, and cross-platform terminal emulator", url: "https://github.com/ghostty-org/ghostty", snippet: "Fast  terminal\n emulator" }]), 50);
  const lines = out.split("\n");
  assert.equal(lines[1], "   https://github.com/ghostty-org/ghostty");
  assert.ok(lines[0].length <= 50 && lines[0].endsWith("…"));
  assert.equal(lines[2], "   Fast terminal emulator");
});
