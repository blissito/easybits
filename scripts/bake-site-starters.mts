// Hornea el snapshot de plataforma de cada stack de /dash/sitios: una caja (de la
// plataforma, sin owner) con el starter instalado en /opt/eb-starter/<stack>, capturada
// como derivado público `pub:site-starter:<stack>`. Las máquinas de sitio nacen de él y
// copian la carpeta a /app en vez de instalar (ver starterSnapshot).
//
// Correr tras cambiar un starter o su instalación (cambia el hash; los viejos los
// reemplaza el siguiente bake, las máquinas sin derivado nacen normal):
//   npx tsx --tsconfig tsconfig.json scripts/bake-site-starters.mts [stack…]
import "dotenv/config";
import { callHost } from "~/.server/core/sandboxOperations";
import { SITE_STACKS, type SiteStackId } from "~/lib/siteStacks";
import { STARTER_DIR, starterFiles, starterInstallCommand, starterSnapshot, starterTemplate } from "~/.server/starters";

type Box = { sandboxId: string; status: string };
type Exec = { exitCode: number; stdout: string; stderr: string };

const exec = (id: string, command: string, timeoutSeconds = 120) =>
  callHost<Exec>("POST", `/v1/sandbox/${id}/exec`, { command, timeoutSeconds }, undefined, (timeoutSeconds + 15) * 1000);

async function bake(stack: SiteStackId) {
  const { templateKey, templateHash } = starterSnapshot(stack);
  const existing = await callHost<unknown>("GET", `/v1/template-snapshot?key=${encodeURIComponent(templateKey)}&hash=${templateHash}`).catch(() => null);
  if (existing) return console.log(`${stack}: ya existe (${templateKey} ${templateHash})`);

  const t0 = Date.now();
  // Sin owner = plataforma (anonymous): el derivado queda público por su key `pub:`.
  const box = await callHost<Box>("POST", "/v1/sandbox", {
    template: starterTemplate(stack),
    name: `bake-${stack}`,
    timeoutSeconds: 1800,
    // En el fierro A (`local`): ahí toda caja nace en frío con su .cow. En B un create
    // clona el dorado de su forma y un clon no se puede capturar (501 DerivedTemplateUnsupported).
    metadata: { placement: "local", placement_strict: "1" },
    vcpus: 2,
    memoryMb: 2048,
  });
  const id = box.sandboxId;
  try {
    for (let i = 0; i < 60; i++) {
      const s = await callHost<Box>("GET", `/v1/sandbox/${id}`);
      if (s.status === "running") break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    const dir = `${STARTER_DIR}/${stack}`;
    for (const [path, content] of Object.entries(starterFiles(stack))) {
      const b64 = Buffer.from(content).toString("base64");
      const r = await exec(id, `mkdir -p "$(dirname '${dir}/${path}')" && echo '${b64}' | base64 -d > '${dir}/${path}'`);
      if (r.exitCode !== 0) throw new Error(`${path}: ${r.stderr}`);
    }
    const t1 = Date.now();
    const inst = await exec(id, `cd ${dir} && ${starterInstallCommand(stack)} 2>&1 | tail -5 && du -sh node_modules`, 600);
    if (inst.exitCode !== 0) throw new Error(`install: ${inst.stdout}${inst.stderr}`);
    const size = inst.stdout.trim().split("\n").pop();
    const meta = await callHost<{ derivedId: string; reused?: boolean }>(
      "POST",
      `/v1/sandbox/${id}/template-snapshot`,
      { key: templateKey, hash: templateHash, name: `site-starter ${stack}`, includeVolumes: false },
      undefined,
      300_000
    );
    console.log(`${stack}: ${meta.derivedId} (instalar ${((Date.now() - t1) / 1000).toFixed(1)} s, ${size}, total ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  } finally {
    await callHost("DELETE", `/v1/sandbox/${id}`).catch((e) => console.error(`${stack}: no se pudo borrar ${id}`, e));
  }
}

const wanted = process.argv.slice(2);
const stacks = SITE_STACKS.map((s) => s.id).filter((id) => !wanted.length || wanted.includes(id));
for (const stack of stacks) {
  await bake(stack).catch((e) => console.error(`${stack}: FALLÓ`, e instanceof Error ? e.message : e));
}
