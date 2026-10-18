import { test } from "node:test";
import assert from "node:assert/strict";
import { actionFromFlags, describeCronAction, isUserCronId } from "./commands/crons.ts";

test("isUserCronId: un id de 24 hex es tuyo; una key de la plataforma no", () => {
  assert.equal(isUserCronId("66f0c2a1b2c3d4e5f6a7b8c9"), true);
  assert.equal(isUserCronId("backup-machines"), false);
  assert.equal(isUserCronId("dispatch-user-crons"), false);
});

test("actionFromFlags: url o agente, nunca los dos", () => {
  assert.deepEqual(actionFromFlags({ url: "https://a.com", method: "post", secret: "TOK" }).action, {
    type: "http",
    url: "https://a.com",
    method: "POST",
    secretName: "TOK",
  });
  assert.deepEqual(actionFromFlags({ agent: "x", prompt: "hola" }).action, { type: "agent_turn", fleetAgentId: "x", prompt: "hola" });
  assert.ok("error" in actionFromFlags({ url: "https://a.com", agent: "x" }));
  assert.ok("error" in actionFromFlags({ agent: "x" }));
  assert.deepEqual(actionFromFlags({}), {});
});

test("describeCronAction: una línea", () => {
  assert.equal(describeCronAction({ type: "http", method: "GET", url: "https://a.com" }), "GET https://a.com");
  assert.match(describeCronAction({ type: "agent_turn", fleetAgentId: "x", prompt: "p".repeat(80) }), /…$/);
});
