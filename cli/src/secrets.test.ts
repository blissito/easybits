import { test } from "node:test";
import assert from "node:assert/strict";
import { secretsToSet } from "./commands/secrets.ts";

const stdin = (v: string) => async () => v;

test("un NOMBRE toma su valor de stdin, sin el salto de línea final", async () => {
  assert.deepEqual(await secretsToSet(["GITHUB_TOKEN"], undefined, stdin("ghp_abc\n")), { GITHUB_TOKEN: "ghp_abc" });
});

test("NOMBRE=valor en argv se rechaza (lo verían ps y el historial)", async () => {
  await assert.rejects(secretsToSet(["GITHUB_TOKEN=ghp_abc"], undefined, stdin("")), /argv/);
});

test("nombres fuera de [A-Z_][A-Z0-9_]* y valores vacíos se rechazan antes de la API", async () => {
  await assert.rejects(secretsToSet(["github_token"], undefined, stdin("x")), /github_token/);
  await assert.rejects(secretsToSet(["TOKEN"], undefined, stdin("\n")), /TOKEN/);
});

test("sin --dotenv ni NOMBRE es error de uso", async () => {
  await assert.rejects(secretsToSet([], undefined, stdin("")), /--dotenv/);
  await assert.rejects(secretsToSet(["A", "B"], undefined, stdin("x")), /--dotenv/);
});
