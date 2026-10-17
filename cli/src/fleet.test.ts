import { test } from "node:test";
import assert from "node:assert/strict";
import { configureActions } from "./commands/fleet.ts";
import { REF_ARGS, looksLikeId } from "./refs.ts";

test("configure: el motor va antes que el modelo y el reciclado al final", () => {
  assert.deepEqual(configureActions({ recycle: true, model: "claude-sonnet-5-5", engine: "claude", name: "Nik" }), [
    { action: "set-name", name: "Nik" },
    { action: "set-engine", engine: "claude" },
    { action: "set-model", model: "claude-sonnet-5-5" },
    { action: "recycle-box" },
  ]);
});

test("configure: valores fuera de catálogo son error de uso antes de la red", () => {
  assert.throws(() => configureActions({ effort: "turbo" }), /--effort/);
  assert.throws(() => configureActions({ ownNumber: "yes" }), /on/);
  assert.throws(() => configureActions({}), /--name/);
  assert.deepEqual(configureActions({ ownNumber: "off" }), [{ action: "toggle-own-number", on: false }]);
});

test("las hojas de fleet aceptan el nombre del agente", () => {
  for (const sub of ["get", "capabilities", "configure", "message"]) assert.deepEqual(REF_ARGS[`fleet ${sub}`], { index: 0, kind: "fleet" });
  assert.equal(looksLikeId("fleet", "6a3da337aaaaaaaaaaaaaaaa"), true);
});
