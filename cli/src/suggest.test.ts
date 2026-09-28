import { test } from "node:test";
import assert from "node:assert/strict";
import { didYouMean, levenshtein, suggest } from "./suggest.ts";

test("levenshtein", () => {
  assert.equal(levenshtein("", "abc"), 3);
  assert.equal(levenshtein("sandbox", "sandboxes"), 2);
  assert.equal(levenshtein("qeury", "query"), 2);
  assert.equal(levenshtein("db", "db"), 0);
});

test("suggest: cercanos y prefijos, nunca lejanos", () => {
  assert.deepEqual(suggest("agnets", ["agents", "login", "db"]), ["agents"]);
  assert.deepEqual(suggest("sand", ["sandboxes", "ssh-key"]), ["sandboxes"]);
  assert.deepEqual(suggest("zzzzzz", ["agents", "db"]), []);
  assert.deepEqual(suggest("QUERY", ["query"]), ["query"]);
});

test("didYouMean arma la pista", () => {
  assert.equal(didYouMean("dv", ["db"], "easybits "), "Did you mean this?\n  easybits db");
  assert.equal(didYouMean("nothing-like-it", ["db"], "easybits "), undefined);
  const canon = (n: string) => (n === "list" ? "ls" : n);
  assert.equal(didYouMean("lst", ["ls", "list"], "easybits db ", canon), "Did you mean this?\n  easybits db ls");
});
