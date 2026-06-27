/**
 * One-off: fija la persona CUSTOM de denik (capa 2) en el fleetAgent de la flota.
 *
 * El worker NUNCA sobreescribe la base de EasyBits: appendea esta persona al
 * preset `claude_code` (provider.ts), y la personalización POR-ORG (capa 3) se
 * appendea encima per-mensaje desde denik (buildOrgAppend). Esta persona es de
 * PRODUCTO denik (no menciona ninguna org concreta).
 *
 * CRÍTICO: incluye DENIK_BASE_URL en persona.env — denikServerConfig (worker.ts)
 * lee process.env.DENIK_BASE_URL para armar el MCP @denik.me/mcp; sin él pega a
 * base vacía → 404 (el gotcha de localhost/base).
 *
 * Run: cd /Users/bliss/easybits && npx tsx scripts/set-denik-fleetAgent-persona.ts [fleetAgentId]
 * ⚠️ Pega contra la DB de PROD.
 */
import "dotenv/config";
import { db } from "../app/.server/db";

const FLEET_AGENT_ID = process.argv[2] || "6a3da33701649d68258e42da";

const DENIK_SYSTEM_PROMPT = [
  "Eres el asistente de un negocio que usa denik.me para agendar citas.",
  "Con tus tools puedes listar los servicios del negocio, ver los horarios disponibles y agendar citas.",
  "Para servicios gratuitos puedes crear la reserva con el email del cliente (recibirá un email para confirmar antes de que quede agendada).",
  "Para servicios de pago NO crees la reserva: comparte el bookingUrl que regresa list_services o el checkoutUrl de create_booking para que el cliente complete el pago en la página.",
  "Si no encuentras el servicio o el horario que pide el cliente, sé honesto y ofrécele opciones cercanas.",
  "Responde en español, breve y cálido. No inventes datos: si no tienes la info, úsala desde tus tools o dilo con honestidad.",
].join(" ");

const persona = {
  name: "Nik",
  env: {
    ASSISTANT_NAME: "Nik",
    DENIK_BASE_URL: process.env.DENIK_BASE_URL || "https://www.denik.me",
    SYSTEM_PROMPT: DENIK_SYSTEM_PROMPT,
  },
};

async function main() {
  const before = await db.fleetAgent.findUnique({
    where: { id: FLEET_AGENT_ID },
    select: { name: true, persona: true },
  });
  if (!before) throw new Error(`fleetAgent ${FLEET_AGENT_ID} no encontrado`);
  console.log(`fleetAgent "${before.name}" (${FLEET_AGENT_ID})`);
  console.log("persona ANTES:", JSON.stringify(before.persona)?.slice(0, 120));
  // assistantName es la columna que baileys usa como PREFIJO de texto en cada
  // respuesta cuando hasOwnNumber=false (`${assistantName}: …`). createFleetAgent la
  // hardcodea a "Ghosty"; hay que alinearla a la persona o el bot se presenta
  // como "Ghosty: …" aunque el SYSTEM_PROMPT ya sea el de denik.
  await db.fleetAgent.update({
    where: { id: FLEET_AGENT_ID },
    data: { persona: persona as any, assistantName: "Nik" },
  });
  console.log("persona DESPUÉS:", JSON.stringify(persona).slice(0, 200));
  console.log("assistantName DESPUÉS: Nik");
  console.log("✅ persona + assistantName denik fijados (DENIK_BASE_URL incluido).");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  });
