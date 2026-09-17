/**
 * Smoke test del backend contra la nube REAL (crea/destruye cajas y un
 * snapshot). Ejercita el contrato de eve de punta a punta:
 *   prewarm → create (fork) → run/spawn/files → stop → reattach → delete.
 *
 *   EASYBITS_API_KEY=… npx tsx scripts/smoke.ts
 */
import { easybits } from "../src/index.js";
import { EasybitsClient } from "@easybits.cloud/sdk";

const NO_FORK = !!process.env.EVE_SMOKE_NO_FORK;
const templateKey = NO_FORK ? null : `smoke-${Date.now().toString(36)}`;
const backend = easybits({ template: "node", timeoutSeconds: 600 });
const t = (label: string, t0: number) => console.log(`  ${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

let t0 = Date.now();
if (!NO_FORK) {
console.log("1. prewarm");
const pre = await backend.prewarm({
  templateKey: templateKey!,
  seedFiles: [
    { path: "seed.txt", content: "hola desde seed\n" },
    { path: "$HOME/.agents/skills/demo/SKILL.md", content: "# demo\n" },
  ],
  bootstrap: async ({ use }) => {
    const s = await use();
    const r = await s.run({ command: "node -v && echo bootstrapped > marker.txt" });
    if (r.exitCode !== 0) throw new Error(`bootstrap failed: ${r.stderr}`);
    console.log("  bootstrap node:", r.stdout.trim().split("\n")[0]);
  },
  runtimeContext: { appRoot: process.cwd() },
});
console.log("  reused:", pre.reused); t("prewarm", t0);

t0 = Date.now();
console.log("2. prewarm otra vez (debe reusar)");
 const pre2 = await backend.prewarm({ templateKey: templateKey!, seedFiles: [], runtimeContext: { appRoot: process.cwd() } });
if (!pre2.reused) throw new Error("second prewarm did not reuse snapshot");
t("prewarm#2", t0);
}

t0 = Date.now();
console.log("3. create (fork del snapshot)");
const sessionKey = `sess-${Date.now().toString(36)}`;
const h = await backend.create({ templateKey, sessionKey, tags: { agent: "smoke" }, runtimeContext: { appRoot: process.cwd() } });
t("create", t0);
const s = h.session;

if (!NO_FORK) {
const marker = await s.readTextFile({ path: "marker.txt" });
const seed = await s.readTextFile({ path: "seed.txt" });
if (marker?.trim() !== "bootstrapped" || seed?.trim() !== "hola desde seed") throw new Error(`snapshot state missing: ${marker} / ${seed}`);
const skill = await s.readTextFile({ path: "$HOME/.agents/skills/demo/SKILL.md" });
if (skill?.trim() !== "# demo") throw new Error(`seed $HOME no llegó: ${skill}`);
console.log("  estado del bootstrap + seed $HOME presentes ✓");
}

await s.writeTextFile({ path: "deep/dir/a.txt", content: "l1\nl2\nl3\n" });
const l2 = await s.readTextFile({ path: "deep/dir/a.txt", startLine: 2, endLine: 2 });
if (l2 !== "l2\n") throw new Error(`line range wrong: ${JSON.stringify(l2)}`);
const missing = await s.readTextFile({ path: "nope.txt" });
if (missing !== null) throw new Error("missing file should be null");
await s.writeBinaryFile({ path: "bin.dat", content: new Uint8Array([0, 255, 10, 13]) });
const bin = await s.readBinaryFile({ path: "bin.dat" });
if (!bin || bin.length !== 4 || bin[1] !== 255) throw new Error("binary roundtrip failed");
console.log("  files text/binary/line-range/null ✓");

const r = await s.run({ command: "pwd && echo $FOO && exit 3", env: { FOO: "bar" } });
if (r.exitCode !== 3 || !r.stdout.includes("/workspace") || !r.stdout.includes("bar")) throw new Error(`run wrong: ${JSON.stringify(r)}`);
console.log("  run exitCode/env/cwd ✓");

t0 = Date.now();
const p = await s.spawn({ command: "for i in 1 2 3; do echo tick$i; sleep 1; done; echo err >&2" });
const chunks: string[] = [];
const reader = p.stdout.getReader();
const dec = new TextDecoder();
const drain = (async () => { for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(dec.decode(value)); } })();
const w = await p.wait();
await drain;
if (w.exitCode !== 0 || !chunks.join("").includes("tick3")) throw new Error(`spawn wrong: ${w.exitCode} ${chunks.join("")}`);
t("spawn 3s", t0); console.log("  spawn stream/wait ✓");

const p2 = await s.spawn({ command: "sleep 60" });
await p2.kill();
const w2 = await p2.wait();
console.log("  spawn kill → exitCode", w2.exitCode, "✓");

await s.removePath({ path: "deep", recursive: true });
await s.removePath({ path: "deep", force: true }); // ya no existe: force lo ignora
console.log("  removePath ✓");

t0 = Date.now();
console.log("4. stop (suspend) + reattach");
const state = await h.captureState();
await h.stop();
const h2 = await backend.create({ templateKey, sessionKey, existingMetadata: state.metadata, runtimeContext: { appRoot: process.cwd() } });
const again = await h2.session.readBinaryFile({ path: "bin.dat" });
if (again === null) throw new Error("state lost after reattach");
const st = await h2.captureState();
if (st.metadata.sandboxId !== state.metadata.sandboxId) throw new Error("reattach opened a different box");
t("suspend+resume", t0); console.log("  misma caja, estado intacto ✓");

console.log("5. delete + limpiar snapshot");
await h2.delete();
const eb = new EasybitsClient({ apiKey: process.env.EASYBITS_API_KEY! });
for (const snap of await eb.sandboxes.snapshots.list()) {
  if (snap.name?.startsWith(`eve:${templateKey}:`)) await eb.sandboxes.snapshots.delete(snap.snapshotId);
}
console.log("OK");
