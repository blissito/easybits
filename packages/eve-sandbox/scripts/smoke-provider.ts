/**
 * Smoke del provider (eve ≥ 0.64) contra la nube REAL. Llama la
 * implementación cruda (`createEasybitsProvider`) con un contexto falso —
 * `environment.open()` exige el runtime de eve — y ejercita:
 *   prepare → prepare#2 (reusa) → start → run/env/seeds → stop → resume → delete
 *   → resume de la caja borrada FALLA (contrato de eve: reconecta, no recrea).
 *
 *   EASYBITS_API_KEY=… npx tsx scripts/smoke-provider.ts
 */
import { EasybitsClient } from "@easybits.cloud/sdk";
import { createEasybitsProvider } from "../src/provider-impl.js";

const t = (label: string, t0: number) => console.log(`  ${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const run = Date.now().toString(36);
const resourcesKey = `smoke-${run}`;

const provider = createEasybitsProvider({
  template: "node",
  timeoutSeconds: 600,
  prepare: async (sandbox) => {
    const r = await sandbox.run({ command: "node -v && echo prepared > marker.txt" });
    if (r.exitCode !== 0) throw new Error(`prepare failed: ${r.stderr}`);
    console.log("  prepare node:", r.stdout.trim().split("\n")[0]);
  },
});

const host = { loadOptionalPackage: async () => { throw new Error("n/a"); }, resolveProjectPath: (p: string) => p };
const prepareCtx = {
  files: { list: async () => [], read: async () => new Uint8Array(), readText: async () => "" },
  host,
  log: (m: string) => console.log("  log:", m),
  resources: {
    source: { kind: "inline" as const, key: resourcesKey },
    workspace: { key: `${resourcesKey}:workspace`, mountPath: "/eve/resources/workspace", targetPath: "/workspace", files: [{ relativePath: "seed.txt", content: "hola desde seed\n" }] },
    skills: { key: `${resourcesKey}:skills`, mountPath: "/eve/resources/skills", targetPath: "$HOME/.agents/skills", files: [{ relativePath: "demo/SKILL.md", content: "# demo\n" }] },
  },
  storagePath: "/tmp/eve-smoke",
};
const sessionCtx = { host, session: { auth: null, id: `sess-${run}`, turn: null }, storagePath: "/tmp/eve-smoke" };

let t0 = Date.now();
console.log("1. prepare");
const artifact = await provider.prepare(prepareCtx);
console.log("  artifact:", JSON.stringify(artifact)); t("prepare", t0);

t0 = Date.now();
console.log("2. prepare otra vez (debe reusar)");
const artifact2 = await provider.prepare(prepareCtx);
if (artifact2.derivedId !== artifact.derivedId) throw new Error("second prepare did not reuse template");
t("prepare#2", t0);

t0 = Date.now();
console.log("3. start (create desde plantilla + env + networkPolicy)");
const { handle, state } = await provider.start(sessionCtx, { env: { FOO: "bar baz" }, networkPolicy: "allow-all" }, artifact);
console.log("  state:", JSON.stringify(state)); t("start", t0);
const s = handle.sandbox;

{
  const marker = await s.readTextFile({ path: "marker.txt" });
  const seed = await s.readTextFile({ path: "seed.txt" });
  const skill = await s.readTextFile({ path: "$HOME/.agents/skills/demo/SKILL.md" });
  if (marker?.trim() !== "prepared" || seed?.trim() !== "hola desde seed" || skill?.trim() !== "# demo") throw new Error(`snapshot state missing: ${marker}/${seed}/${skill}`);
  console.log("  prepare + workspace + skills presentes ✓");
}
const r = await s.run({ command: "pwd && echo \"$FOO\"" });
if (r.exitCode !== 0 || !r.stdout.includes("/workspace") || !r.stdout.includes("bar baz")) throw new Error(`run/env wrong: ${JSON.stringify(r)}`);
console.log("  run cwd + env de open() ✓");
await s.writeTextFile({ path: "live.txt", content: "vivo\n" });

t0 = Date.now();
console.log("4. onSessionStop (suspend) + resume");
await handle.onSessionStop();
const h2 = await provider.resume(sessionCtx, artifact, state);
const live = await h2.sandbox.readTextFile({ path: "live.txt" });
if (live?.trim() !== "vivo") throw new Error("state lost after resume");
const env2 = await h2.sandbox.run({ command: "echo \"$FOO\"" });
if (!env2.stdout.includes("bar baz")) throw new Error("env lost after resume");
t("suspend+resume", t0); console.log("  misma caja, estado + env intactos ✓");

console.log("5. onSessionDelete + limpiar plantilla");
await h2.onSessionDelete();
const eb = new EasybitsClient({ apiKey: process.env.EASYBITS_API_KEY! });
// Borrar plantillas exige scope DELETE; con una key WRITE se avisa y queda (12 MB).
await eb.sandboxes.templateSnapshots
  .delete(artifact.derivedId)
  .then(() => console.log("  plantilla borrada", artifact.derivedId))
  .catch((e) => console.log(`  ⚠ plantilla ${artifact.derivedId} NO borrada (${e.status ?? e.message}): bórrala con una key DELETE`));
const resumedDeleted = await provider.resume(sessionCtx, artifact, state).then(() => true, () => false);
if (resumedDeleted) throw new Error("resume de una caja borrada NO falló (debe fallar, no recrear)");
console.log("  resume de la caja borrada falla ✓");
const leftover = (await eb.sandboxes.list()).filter((b) => b.name === state.sessionName && b.status !== "lost");
if (leftover.length) throw new Error(`caja no borrada: ${leftover.map((b) => b.sandboxId)}`);
console.log("OK");
