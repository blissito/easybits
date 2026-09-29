import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeArgs } from "./aliases.ts";

const n = (s: string) => normalizeArgs(s.split(" ").filter(Boolean));

test("lo nuevo no avisa y pasa igual", () => {
  const r = n("sb exec box --timeout 30 -- sleep 1");
  assert.deepEqual(r.argv, "sb exec box --timeout 30 -- sleep 1".split(" "));
  assert.equal(r.notes.length, 0);
  assert.equal(n("machines deploy shop -m v2").notes.length, 0);
  assert.equal(n("mcp config --stdio").notes.length, 0);
});

test("config → mcp config; mcp → mcp config --stdio", () => {
  assert.deepEqual(n("config").argv, ["mcp", "config"]);
  assert.equal(n("config").notes.length, 1);
  assert.deepEqual(n("mcp").argv, ["mcp", "config", "--stdio"]);
  assert.deepEqual(n("mcp --help").argv, ["mcp", "--help"]);
  assert.equal(n("mcp --help").notes.length, 0);
});

test("deploy es el verbo; como sustantivo avisa", () => {
  const v = n("deploy shop -m v2");
  assert.deepEqual(v.argv, ["machines", "deploy", "shop", "-m", "v2"]);
  assert.equal(v.notes.length, 0);
  const old = n("deploy ls --json");
  assert.deepEqual(old.argv, ["machines", "ls", "--json"]);
  assert.equal(old.notes.length, 1);
  assert.deepEqual(n("deploy deploy shop").argv, ["machines", "deploy", "shop"]);
  assert.deepEqual(n("deploy --help").argv, ["machines", "deploy", "--help"]);
});

test("machines release → deploy (no choca con releases)", () => {
  assert.deepEqual(n("machines release shop").argv, ["machines", "deploy", "shop"]);
  assert.equal(n("machines releases shop").notes.length, 0);
  assert.deepEqual(n("deploy release shop").argv, ["machines", "deploy", "shop"]);
});

test("sandboxes create --timeout → --ttl; exec lo conserva", () => {
  const r = n("sb create --template node --timeout 600");
  assert.deepEqual(r.argv, ["sb", "create", "--template", "node", "--ttl", "600"]);
  assert.equal(r.notes.length, 1);
  assert.deepEqual(n("sandboxes new --timeout=60").argv, ["sandboxes", "new", "--ttl=60"]);
  assert.equal(n("sb create --ttl 600").notes.length, 0);
});

test("agents create --timeout → --ttl", () => {
  const r = n("agents create --template goose --timeout 600");
  assert.deepEqual(r.argv, ["agents", "create", "--template", "goose", "--ttl", "600"]);
  assert.equal(r.notes.length, 1);
  assert.equal(n("agents try helper --timeout 5").notes.length, 0);
});

test("--token no se confunde con un posicional", () => {
  assert.deepEqual(n("--token k deploy shop").argv, ["--token", "k", "machines", "deploy", "shop"]);
});
