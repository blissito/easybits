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

test("domains de caja (forma vieja) → sandboxes domains, con aviso", () => {
  const add = n("domains add sb_1 shop.example.com --port 3000");
  assert.deepEqual(add.argv, "sandboxes domains add sb_1 shop.example.com --port 3000".split(" "));
  assert.equal(add.notes.length, 1);
  assert.match(add.notes[0][0], /`easybits domains add <sandbox> …` is now `easybits sandboxes domains add/);
  assert.deepEqual(n("domain ls shop").argv, ["sandboxes", "domains", "ls", "shop"]);
  assert.deepEqual(n("domains verify sb_1 shop.example.com").argv, ["sandboxes", "domains", "verify", "sb_1", "shop.example.com"]);
  assert.deepEqual(n("domains rm sb_1 shop.example.com --yes").argv, ["sandboxes", "domains", "rm", "sb_1", "shop.example.com", "--yes"]);
});

test("domains de la cuenta (forma nueva) pasa igual y sin aviso", () => {
  for (const s of ["domains ls", "domains ls --json", "domains add example.com", "domains verify example.com", "domains rm example.com --yes", "domains apex example.com mi-tienda", "domains dns-auto example.com --undo"]) {
    const r = n(s);
    assert.deepEqual(r.argv, s.split(" "), s);
    assert.equal(r.notes.length, 0, s);
  }
});

import { parseDeviceAuth } from "./commands/sandboxes.js";
test("codex login: saca link y código de la salida de codex login --device-auth (con colores)", () => {
  const out = "Follow these steps\n1. Open this link\n   \u001b[94mhttps://auth.openai.com/codex/device\u001b[0m\n2. Enter this one-time code \u001b[90m(expires in 15 minutes)\u001b[0m\n   \u001b[94mAB12-CD3EF\u001b[0m\n";
  assert.deepEqual(parseDeviceAuth(out), { url: "https://auth.openai.com/codex/device", code: "AB12-CD3EF" });
  assert.deepEqual(parseDeviceAuth("cargando…"), { url: undefined, code: undefined });
});
