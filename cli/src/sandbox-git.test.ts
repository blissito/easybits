import { test } from "node:test";
import assert from "node:assert/strict";
import { gitParams } from "./commands/sandboxes.ts";
import { REF_ARGS } from "./refs.ts";

test("git: las banderas se traducen a los parámetros del SDK, sin llaves vacías", () => {
  assert.deepEqual(gitParams("clone", { dir: "/data/app", repo: "https://github.com/a/b.git", sha: "abc", token: "$secret:GH" }), {
    repo: "https://github.com/a/b.git",
    dir: "/data/app",
    commit: "abc",
    token: "$secret:GH",
  });
  assert.deepEqual(gitParams("commit", { dir: "/d", message: "fix", all: true, paths: [] }), { dir: "/d", message: "fix", addAll: true });
  assert.deepEqual(gitParams("checkout", { dir: "/d", branch: "x", create: true }), { dir: "/d", branch: "x", create: true });
  assert.deepEqual(gitParams("log", { dir: "/d", limit: 5, paths: ["src/a.ts"] }), { dir: "/d", limit: 5, path: "src/a.ts" });
  assert.deepEqual(gitParams("status", { dir: "/d" }), { dir: "/d" });
});

test("git: lo que exige cada operación es error de uso antes de la red", () => {
  assert.throws(() => gitParams("clone", { dir: "/d" }), /--repo/);
  assert.throws(() => gitParams("commit", { dir: "/d" }), /-m/);
  assert.throws(() => gitParams("checkout", { dir: "/d" }), /--branch/);
  assert.throws(() => gitParams("status", {}), /--dir/);
  assert.throws(() => gitParams("rebase", { dir: "/d" }), /rebase/);
});

test("bg y git aceptan el nombre del sandbox (segundo posicional)", () => {
  assert.deepEqual(REF_ARGS["sandboxes bg"], { index: 1, kind: "sandbox" });
  assert.deepEqual(REF_ARGS["sandboxes git"], { index: 1, kind: "sandbox" });
});
