/**
 * Clona un FleetAgent existente cambiándole el MOTOR.
 *
 * Para qué: el motor es una propiedad de la CAJA (un claude-worker no puede usar una
 * llave de OpenAI), así que ofrecer "elige tu motor" por tenant exige tener un agente
 * por motor. Este script crea el gemelo conservando lo que define al asistente
 * (prompt, nombre, tools, conectores, config por grupo) y DESCARTANDO lo que es
 * propiedad física del original.
 *
 * Lo que NO se copia, y por qué:
 *   baileys / authCreds / enabledGroups / mainGroupJid / wabaConfig
 *     → el socket de WhatsApp es único por número. Duplicar esas credenciales rompe
 *       el pareo del original. El gemelo nace sin canal; se le conecta aparte.
 *   groupKeys
 *     → son llaves de tenants ligadas a grupos que viven en el número del original.
 *   engineSecretName
 *     → el gemelo usa el nombre canónico del motor nuevo salvo que se pida otro.
 *
 * Uso:
 *   npx tsx scripts/clone-fleet-agent-engine.ts <fleetAgentId> <engineId> [--name "..."] [--model <id>] [--apply]
 *
 * Sin --apply hace DRY-RUN: imprime exactamente qué crearía y no escribe nada.
 */
import { db } from "../app/.server/db";
import { createFleetAgent } from "../app/.server/core/fleetAgentOperations";
import { getEngine, engineCreatable, FLEET_ENGINES } from "../app/lib/fleetEngines";

const [, , sourceId, engineId, ...rest] = process.argv;
const apply = rest.includes("--apply");
const nameIdx = rest.indexOf("--name");
const nameOverride = nameIdx >= 0 ? rest[nameIdx + 1] : undefined;
const modelIdx = rest.indexOf("--model");
const modelOverride = modelIdx >= 0 ? rest[modelIdx + 1] : undefined;

if (!sourceId || !engineId) {
  console.error(
    "uso: npx tsx scripts/clone-fleet-agent-engine.ts <fleetAgentId> <engineId> [--name \"...\"] [--apply]\n" +
      `motores: ${FLEET_ENGINES.map((e) => e.id).join(", ")}`
  );
  process.exit(1);
}

const engine = getEngine(engineId);
if (!engine) {
  console.error(`motor desconocido: ${engineId}`);
  process.exit(1);
}
if (!engineCreatable(engine)) {
  console.error(`motor sin modelos listos: ${engineId}`);
  process.exit(1);
}

const src = await db.fleetAgent.findUnique({ where: { id: sourceId } });
if (!src) {
  console.error(`no existe el FleetAgent ${sourceId}`);
  process.exit(1);
}

const srcPersona = (src.persona ?? {}) as { name?: string; env?: Record<string, string>; seedFiles?: unknown };
const srcEnv = { ...(srcPersona.env ?? {}) };

// El modelo del motor VIEJO no aplica al nuevo: se quitan todas las modelEnv
// conocidas para que createFleetAgent escriba la del motor destino (su defaultModel).
// Igual con GHOSTY_LLM y cualquier env que un motor use para identificarse.
for (const e of FLEET_ENGINES) {
  if (e.modelEnv) delete srcEnv[e.modelEnv];
  for (const k of Object.keys(e.env ?? {})) delete srcEnv[k];
}
// La credencial nunca debe viajar en la persona (va por el vault; ver resolveEngineSecret).
for (const e of FLEET_ENGINES) if (e.secret) delete srcEnv[e.secret.name];

// Modelo destino: el pedido, si es READY en este motor; si no, el default del motor.
const model = engine.models.some((m) => m.id === modelOverride && m.ready !== false)
  ? modelOverride!
  : engine.defaultModel;
if (modelOverride && model !== modelOverride) {
  console.error(`⚠️  modelo "${modelOverride}" no disponible en ${engine.id}; se usa ${model}`);
}

const name = nameOverride ?? `${src.name ?? "Agente"} · ${engine.label.replace(/^Ghosty · /, "")}`;
const persona = {
  ...srcPersona,
  env: { ...srcEnv, ...(engine.env ?? {}), ASSISTANT_NAME: srcEnv.ASSISTANT_NAME ?? src.assistantName },
};

console.log(`origen : ${src.name} (${src.id}) [${src.workerTemplate}]`);
console.log(`destino: ${name} [${engine.template}] modelo=${model ?? "-"}`);
console.log(`persona.env → ${Object.keys(persona.env).sort().join(", ")}`);
console.log(`copia además: groupConfigs=${src.groupConfigs ? "sí" : "no"} mcpCatalog=${src.mcpCatalog ? "sí" : "no"} skills=${Array.isArray(src.skills) ? (src.skills as unknown[]).length : 0}`);
console.log(`NO copia   : baileys, authCreds, enabledGroups, mainGroupJid, wabaConfig, groupKeys`);

if (!apply) {
  console.log("\n(dry-run — corre con --apply para crearlo)");
  process.exit(0);
}

// `persona` explícita ⇒ createFleetAgent NO sobreescribe SYSTEM_PROMPT/ASSISTANT_NAME
// ni el modelo. Por eso el modelo del motor destino se fija a mano abajo.
const created = await createFleetAgent(
  { user: { id: src.ownerId } as never, scopes: ["ADMIN"] as never },
  {
    name,
    engine: engine.id,
    persona: persona as never,
    maxWorkersPerVm: src.maxWorkersPerVm,
    vmMemMb: src.vmMemMb,
    maxVms: src.maxVms,
    idleSuspendMin: src.idleSuspendMin,
    destroyIdleMin: src.destroyIdleMin,
  }
);

// Config que createFleetAgent no acepta por parámetro: se copia después.
const patch: Record<string, unknown> = {};
if (src.groupConfigs) patch.groupConfigs = src.groupConfigs;
if (src.mcpCatalog) patch.mcpCatalog = src.mcpCatalog;
if (src.skills) patch.skills = src.skills;
if (engine.modelEnv && model) {
  const p = (await db.fleetAgent.findUnique({ where: { id: created.id }, select: { persona: true } }))!
    .persona as { env?: Record<string, string> };
  patch.persona = { ...p, env: { ...(p.env ?? {}), [engine.modelEnv]: model } };
}
if (Object.keys(patch).length) {
  await db.fleetAgent.update({ where: { id: created.id }, data: patch as never });
}

const final = await db.fleetAgent.findUnique({ where: { id: created.id } });
console.log(`\n✅ creado ${final!.id}`);
console.log(`   token: ${final!.token}`);
console.log(`   env   → ${JSON.stringify((final!.persona as { env?: Record<string, string> }).env)}`);
process.exit(0);
