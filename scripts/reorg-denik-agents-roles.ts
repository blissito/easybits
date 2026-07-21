/**
 * Reorganización DEFINITIVA de roles de los dos agentes Denik (2026-07-21).
 * Va de la mano con el swap de env de denik (EASYBITS_FLEET_ID ↔ _ADMIN) y el cambio
 * de `createEasybitsWhatsAppGroup` → fleetAgentCreds("admin").
 *
 * Modelo final (cada agente UN rol):
 *   · 6a3da33 = **Nik Admin**: tiene el número baileys → grupos WhatsApp + /dash/asistente.
 *       base persona = ADMIN. Se QUITA el override público del canal web (su web ahora es
 *       /dash/asistente admin). hiddenChannels=["web"] → el HUD muestra solo "Personal y grupos".
 *   · 6a5549 = **Nik**: burbujas públicas de landing. base persona = PÚBLICA (atención al
 *       cliente). hiddenChannels=["baileys"] → el HUD muestra solo "Bubbles públicos".
 *
 * NO toca: authCreds/authKeys (baileys), groupKeys, enabledGroups, wabaConfig, ni el resto
 * de persona.env (DENIK_BASE_URL, ANTHROPIC_MODEL, EASYBITS_TOOL_GROUP).
 *
 * ⚠️ Correr JUNTO con el paso 3 del cutover (set EASYBITS_FLEET_ID=6a5549), NO antes:
 * mientras las burbujas sigan pegando a 6a3da33, quitarle el override público las degrada.
 *
 * Run:  npx tsx scripts/reorg-denik-agents-roles.ts           (dry-run)
 *       npx tsx scripts/reorg-denik-agents-roles.ts --apply
 */
import "dotenv/config";
import { db } from "../app/.server/db";

const APPLY = process.argv.includes("--apply");
const ADMIN_AGENT = "6a3da33701649d68258e42da"; // número baileys → Nik Admin (grupos + dash)
const PUBLIC_AGENT = "6a55493ad533fe2daf755211"; // web-only → Nik (burbujas públicas)

const PUBLIC_PROMPT = [
  "Eres Nik, el asistente de atención al cliente de un negocio que usa denik.me.",
  "Hablas con los CLIENTES FINALES del negocio para ayudarles a conocer los servicios, ver disponibilidad y agendar citas.",
  "",
  "- Usa tus herramientas para consultar servicios y horarios REALES; nunca inventes precios, disponibilidad ni datos.",
  "- Para servicios gratuitos puedes crear la reserva con el email del cliente (recibirá un correo para confirmar).",
  "- Para servicios de pago NO crees la reserva: comparte el link de reserva/checkout para que el cliente complete el pago.",
  "- NO administras la cuenta ni ves datos internos del negocio. Si te piden algo administrativo, indica amablemente que eso lo hace el dueño desde su panel.",
  "- Responde en español, cálido y breve.",
].join("\n");

async function main() {
  console.log(APPLY ? "MODO: --apply (PROD)\n" : "MODO: dry-run (usa --apply)\n");

  // ── Nik Admin (6a3da33): mantiene base admin, quita override web, oculta web ──
  const admin = await db.fleetAgent.findUnique({ where: { id: ADMIN_AGENT }, select: { name: true, persona: true, groupConfigs: true } });
  if (!admin) throw new Error("ADMIN_AGENT no encontrado");
  const ap = (admin.persona ?? {}) as any;
  const agc = (admin.groupConfigs ?? {}) as any;
  const adminBase = ap.env?.SYSTEM_PROMPT ?? "(sin prompt admin — REVISAR)";
  const nextAdminGc = { ...agc };
  if (nextAdminGc.web) { const { systemPrompt, ...restWeb } = nextAdminGc.web; nextAdminGc.web = restWeb; }
  const nextAdminPersona = {
    ...ap,
    name: "Nik Admin",
    hiddenChannels: ["web"],
    env: { ...ap.env, ASSISTANT_NAME: "Nik Admin" }, // SYSTEM_PROMPT admin se mantiene
  };
  console.log(`── ${ADMIN_AGENT} (Nik Admin) ──`);
  console.log(`  name: "${admin.name}" → "Nik Admin"`);
  console.log(`  base persona: ADMIN (se mantiene, ${adminBase.length} chars)`);
  console.log(`  web override: ${agc.web?.systemPrompt ? "QUITADO" : "(no había)"}`);
  console.log(`  hiddenChannels: ${JSON.stringify(ap.hiddenChannels ?? [])} → ["web"]`);
  console.log(`  env preservado: ${JSON.stringify(Object.keys(nextAdminPersona.env))}`);

  // ── Nik (6a5549): base PÚBLICA, oculta baileys ──
  const pub = await db.fleetAgent.findUnique({ where: { id: PUBLIC_AGENT }, select: { name: true, persona: true, groupConfigs: true } });
  if (!pub) throw new Error("PUBLIC_AGENT no encontrado");
  const pp = (pub.persona ?? {}) as any;
  const pgc = (pub.groupConfigs ?? {}) as any;
  const nextPubPersona = {
    ...pp,
    name: "Nik",
    hiddenChannels: ["baileys"],
    env: { ...pp.env, ASSISTANT_NAME: "Nik", SYSTEM_PROMPT: PUBLIC_PROMPT },
  };
  console.log(`\n── ${PUBLIC_AGENT} (Nik) ──`);
  console.log(`  name: "${pub.name}" → "Nik"`);
  console.log(`  base persona: ADMIN → PÚBLICA (${PUBLIC_PROMPT.length} chars)`);
  console.log(`  hiddenChannels: ${JSON.stringify(pp.hiddenChannels ?? [])} → ["baileys"]`);
  console.log(`  web.connectedAt: ${pgc.web?.connectedAt ?? "null"} (se preserva)`);
  console.log(`  env preservado: ${JSON.stringify(Object.keys(nextPubPersona.env))}`);

  if (APPLY) {
    await db.fleetAgent.update({ where: { id: ADMIN_AGENT }, data: { name: "Nik Admin", assistantName: "Nik Admin", persona: nextAdminPersona as any, groupConfigs: nextAdminGc as any } });
    await db.fleetAgent.update({ where: { id: PUBLIC_AGENT }, data: { name: "Nik", assistantName: "Nik", persona: nextPubPersona as any } });
    console.log("\n✅ aplicado a ambos");
  } else console.log("\n(dry-run)");
}

main().then(() => process.exit(0)).catch((e) => { console.error("❌", e); process.exit(1); });
