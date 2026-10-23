/**
 * Congela un turno de Sitios como el replay demo de la home: pasos limpios (publicStep) +
 * capturas reducidas a WebP en public/home/replay/. La home no toca servidor ni base:
 * sólo pide public/home/replay-demo.json cuando la sección está por verse.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/export-replay-demo.mts <siteId> [turnId]
 *
 * ⚠️ Revisa a mano cada captura antes de publicar: nada impide que salga una página privada.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { db } from "~/.server/db";
import { siteGroupId } from "~/.server/core/siteOperations";
import { publicStep, type AgentStep } from "~/lib/agentSteps";
import { partirNarracion } from "~/lib/narracion";

const MAX_TOTAL = 300_000;
const OUT_DIR = "public/home/replay";

// En el demo sí se ve el comando (la terminal sin él no cuenta nada), pero sin secretos.
const redact = (c: string) =>
  c
    .replace(/eyJ[\w-]{10,}(?:\.[\w-]+)*/g, "•••")
    .replace(/\b(eb_(?:sk|pk)_|sk-|ghp_|xox[bp]-)[\w-]+/g, "$1•••")
    .replace(/(Bearer\s+)\S+/gi, "$1•••")
    .replace(/([?&](?:token|key|secret|code)=)[^\s&'"]+/gi, "$1•••")
    .replace(/("(?:password|pass|secret|token)"\s*:\s*")[^"]*"/gi, '$1•••"')
    .slice(0, 400);

const [siteId, turnId] = process.argv.slice(2);
if (!siteId) throw new Error("uso: export-replay-demo.mts <siteId> [turnId]");

const turn = await db.fleetTurn.findFirst({
  where: { groupId: siteGroupId(siteId), ...(turnId ? { turnId } : { state: { not: "running" } }) },
  orderBy: { startedAt: "desc" },
  select: { turnId: true, userText: true, text: true, cortes: true, steps: true },
});
if (!turn) throw new Error("turno no encontrado");

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

let total = 0;
let n = 0;
const steps: AgentStep[] = [];
for (const raw of (turn.steps as AgentStep[] | null) ?? []) {
  const s = publicStep(raw);
  if (raw.command) s.command = redact(raw.command);
  if (s.browser?.image) {
    const res = await fetch(s.browser.image);
    if (!res.ok) throw new Error(`captura ${s.browser.image}: ${res.status}`);
    const webp = await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 960, withoutEnlargement: true }).webp({ quality: 60 }).toBuffer();
    const name = `${String(++n).padStart(2, "0")}.webp`;
    await writeFile(`${OUT_DIR}/${name}`, webp);
    total += webp.length;
    s.browser = { ...s.browser, image: `/home/replay/${name}` };
    console.log(`  ${name} ${(webp.length / 1024).toFixed(1)} KB · ${s.browser.url}`);
  }
  steps.push(s);
}

const { resto } = partirNarracion(turn.text ?? "", (turn.cortes as number[] | null) ?? []);
const json = JSON.stringify({ userText: turn.userText, reply: (resto || turn.text || "").slice(0, 600), steps });
await writeFile("public/home/replay-demo.json", json);
total += json.length;

console.log(`✓ turno ${turn.turnId}: ${steps.length} pasos, ${n} capturas, ${(total / 1024).toFixed(0)} KB en total`);
if (/sessionId|eyJ[\w-]{10,}/.test(json)) throw new Error("el JSON trae un sessionId o un JWT: revisa la redacción");
if (total > MAX_TOTAL) throw new Error(`pesa ${(total / 1024).toFixed(0)} KB (máx ${MAX_TOTAL / 1000} KB)`);
process.exit(0);
