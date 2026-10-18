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

test("scheduleFromFlags: se repite o una sola vez, nunca los dos", async () => {
  const { scheduleFromFlags } = await import("./commands/crons.ts");
  assert.deepEqual(scheduleFromFlags({ at: "23:00", tz: "UTC" }).fields, { at: "23:00", timezone: "UTC" });
  assert.deepEqual(scheduleFromFlags({ cron: "0 9 * * *", times: "3" }).fields, { cron: "0 9 * * *", times: 3 });
  assert.ok("error" in scheduleFromFlags({ cron: "0 9 * * *", at: "23:00" }));
  assert.ok("error" in scheduleFromFlags({ at: "23:00", in: "2h" }));
  assert.ok("error" in scheduleFromFlags({ cron: "0 9 * * *", times: "x" }));
});

test("execFromFlags: archivos junto al comando y .p8 como secreto acotado en la misma ruta ~", async () => {
  const { execFromFlags, remotePathFor } = await import("./commands/crons.ts");
  const files: Record<string, string> = { "/h/bliss/proj/scripts/asc.py": "print(1)", "/h/bliss/.appstoreconnect/private_keys/K.p8": "KEY" };
  const read = (p: string) => files[p] ?? (() => { throw new Error(p); })();
  const r = execFromFlags(
    { run: "python3 asc.py", files: ["/h/bliss/proj/scripts/asc.py"], secrets: ["ASC_KEY_ID"], secretFiles: ["ASC_P8:~/.appstoreconnect/private_keys/K.p8"], timeout: "120" },
    read,
    "/h/bliss",
  );
  assert.ok("action" in r && r.action);
  assert.deepEqual(r.action.files, [{ path: "asc.py", content: Buffer.from("print(1)").toString("base64"), encoding: "base64" }]);
  assert.deepEqual(r.action.secrets, [{ name: "ASC_KEY_ID" }, { name: "ASC_P8", file: "~/.appstoreconnect/private_keys/K.p8" }]);
  assert.equal(r.action.timeoutSeconds, 120);
  assert.deepEqual(r.secretValues, { ASC_P8: "KEY" });
  assert.equal(remotePathFor("/tmp/x/key.pem", "/h/bliss"), "key.pem");
  assert.ok("error" in execFromFlags({ run: "x", files: [], secrets: [], secretFiles: ["sin-dos-puntos"] }, read, "/h/bliss"));
});

test("crons wait: código de salida y duraciones", async () => {
  const { runExitCode, parseDurationMs, notifyFromFlags } = await import("./commands/crons.ts");
  assert.equal(runExitCode({ ok: true, exitCode: 0 }), 0);
  assert.equal(runExitCode({ ok: false, exitCode: 3 }), 3);
  assert.equal(runExitCode({ ok: false }), 1);
  assert.equal(runExitCode({ ok: true }), 0);
  assert.equal(parseDurationMs("1h30m"), 90 * 60_000);
  assert.equal(parseDurationMs("ya"), null);
  assert.deepEqual(notifyFromFlags({ notify: "push", notifyOn: "always" }), { notify: { on: "always", push: true } });
  assert.deepEqual(notifyFromFlags({ notify: "none" }), { notify: null });
  assert.deepEqual(notifyFromFlags({}), {});
  assert.ok("error" in notifyFromFlags({ notify: "sms" }));
});

test("inbox: SSE por bloques y línea legible", async () => {
  const { parseSse, eventLine } = await import("./commands/inbox.ts");
  const r = parseSse('event: ready\ndata: {"since":0}\n\n: latido\n\nid: 1\nevent: inbox\ndata: {"seq":1}\n\nid: 2\nevent: in');
  assert.deepEqual(r.events.map((e) => e.event), ["ready", "inbox"]);
  assert.equal(r.events[1].id, "1");
  assert.equal(r.rest, "id: 2\nevent: in");
  const line = eventLine({ seq: 3, source: "http", method: "POST", contentType: "application/json", body: '{"hola":1}', json: { hola: 1 }, receivedAt: "2026-10-18T17:04:00Z" });
  assert.equal(line, '#3 2026-10-18 17:04 http {"hola":1}');
  const { notifyFromFlags } = await import("./commands/crons.ts");
  assert.deepEqual(notifyFromFlags({ notify: "inbox:builds,push" }), { notify: { on: "failure", push: true, inbox: "builds" } });
});
