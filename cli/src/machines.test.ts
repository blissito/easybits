import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runspecFrom } from "./commands/machines.ts";
import { REF_ARGS } from "./refs.ts";
import type { Ctx } from "./types.ts";

const ctx = (opts: Ctx["opts"]): Ctx => ({ json: true, args: [], opts });

test("runspec set: las banderas se traducen a las llaves del runspec", async () => {
  const spec = await runspecFrom(ctx({ start: "node server.js", port: "8080", prebuilt: "on", data: ["/app/data", "/app/uploads"], env: ["NODE_ENV=production"] }));
  assert.deepEqual(spec, { startCommand: "node server.js", port: 8080, prebuilt: true, dataPaths: ["/app/data", "/app/uploads"], env: { NODE_ENV: "production" } });
});

test("runspec set: --prebuilt sólo acepta on|off", async () => {
  assert.deepEqual(await runspecFrom(ctx({ prebuilt: "off" })), { prebuilt: false });
  await assert.rejects(runspecFrom(ctx({ prebuilt: "yes" })), /on/);
});

test("runspec set: --file acepta la salida de `runspec get --json` y las banderas ganan", async () => {
  const dir = mkdtempSync(join(tmpdir(), "eb-runspec-"));
  const file = join(dir, "rs.json");
  writeFileSync(file, JSON.stringify({ runspec: { appDir: "/app", port: 3000, dataPaths: ["/app/db"] } }));
  assert.deepEqual(await runspecFrom(ctx({ file, port: "4000" })), { appDir: "/app", port: 4000, dataPaths: ["/app/db"] });
});

test("las hojas nuevas de machines aceptan el nombre de la máquina", () => {
  for (const sub of ["get", "restart", "redeploy", "backups", "backup", "rm"]) assert.deepEqual(REF_ARGS[`machines ${sub}`], { index: 0, kind: "sandbox" });
  assert.deepEqual(REF_ARGS["machines runspec"], { index: 1, kind: "sandbox" });
});
