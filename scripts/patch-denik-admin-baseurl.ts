/**
 * Surgical patch: añade DENIK_BASE_URL a persona.env del fleetAgent ADMIN de denik
 * SIN clobbear el resto de la persona (SYSTEM_PROMPT admin, EASYBITS_TOOL_GROUP,
 * ANTHROPIC_MODEL). Sin él, denikServerConfig (worker.ts) manda DENIK_BASE_URL=''
 * al binario @denik.me/mcp → new URL('') → "Invalid URL" → el MCP no conecta.
 * ⚠️ Pega contra la DB de PROD.
 */
import "dotenv/config";
import { db } from "../app/.server/db";

const FLEET_AGENT_ID = process.argv[2] || "6a55493ad533fe2daf755211";
const BASE_URL = process.env.DENIK_BASE_URL || "https://www.denik.me";

async function main() {
  const fa = await db.fleetAgent.findUnique({
    where: { id: FLEET_AGENT_ID },
    select: { name: true, persona: true },
  });
  if (!fa) throw new Error(`fleetAgent ${FLEET_AGENT_ID} no encontrado`);
  const persona = (fa.persona ?? {}) as any;
  const env = { ...(persona.env ?? {}) };
  console.log(`fleetAgent "${fa.name}" (${FLEET_AGENT_ID})`);
  console.log("DENIK_BASE_URL ANTES:", env.DENIK_BASE_URL ?? "(MISSING)");
  if (env.DENIK_BASE_URL === BASE_URL) {
    console.log("✅ ya estaba fijado, no-op.");
    return;
  }
  env.DENIK_BASE_URL = BASE_URL;
  const nextPersona = { ...persona, env };
  await db.fleetAgent.update({
    where: { id: FLEET_AGENT_ID },
    data: { persona: nextPersona as any },
  });
  console.log("DENIK_BASE_URL DESPUÉS:", env.DENIK_BASE_URL);
  console.log("persona.env keys (preservadas):", Object.keys(env).join(", "));
  console.log("✅ patched. Recicla el worker para que tome la env nueva (se lee en spawn).");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
