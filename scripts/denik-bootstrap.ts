/**
 * Bootstrap de denik en la flota EasyBits — crea, bajo la cuenta de brenda:
 *   1. Un POOL de WhatsApp (cerebro claude-worker) → su id/token van a denik
 *      como EASYBITS_WA_FLEET_ID / EASYBITS_WA_FLEET_TOKEN (feature "abre el grupo").
 *   2. Un CHATBOT web de prueba (claude-worker standalone) con el MCP de denik.
 *   3. Delegación scope `agents` a fixtergeek → ve/opera la flota desde su cuenta.
 *
 * Prereqs (si faltan, el worker corre sin las tools de denik / sin cerebro):
 *   - brenda@fixter.org existe en la DB.
 *   - Su vault tiene CLAUDE_CODE_OAUTH_TOKEN (cerebro plano OAuth Max).
 *   - La imagen claude-worker en el host trae el MCP @denik.me/mcp (rebuild).
 *   - DENIK_PUBLIC_API_KEY = una dnk_pub_… de una org real (scope del MCP).
 *
 * Run: cd /Users/bliss/easybits && \
 *   DENIK_PUBLIC_API_KEY=dnk_pub_xxx npx tsx scripts/denik-bootstrap.ts
 *
 * ⚠️ Pega contra PROD (npm/dev apuntan a la DB de prod) y CREA VMs reales.
 */
import "dotenv/config";

import { db } from "../app/.server/db";
import type { AuthContext } from "../app/.server/apiAuth";
import { createFleetAgent } from "../app/.server/core/fleetAgentOperations";
import { createAgent } from "../app/.server/core/sandboxOperations";

const BRENDA_EMAIL = process.env.DENIK_OWNER_EMAIL || "brenda@fixter.org";
const DENIK_API_KEY = process.env.DENIK_PUBLIC_API_KEY || "";
const DENIK_BASE_URL = process.env.DENIK_BASE_URL || "https://www.denik.me";
const SYSTEM_PROMPT =
  process.env.DENIK_SYSTEM_PROMPT ||
  "Eres el asistente de un negocio en denik.me. Puedes listar servicios, ver horarios y agendar citas con las tools de denik. Para servicios de pago, comparte el checkoutUrl en vez de agendar. Responde en español, breve y cálido.";

const log = (...a: unknown[]) => console.log(...a);

async function main() {
  if (!DENIK_API_KEY) {
    throw new Error("DENIK_PUBLIC_API_KEY (dnk_pub_…) requerida");
  }
  const user = await db.user.findFirst({ where: { email: BRENDA_EMAIL } });
  if (!user) throw new Error(`owner ${BRENDA_EMAIL} no encontrado en la DB`);
  const ctx: AuthContext = { user, scopes: ["READ", "WRITE", "DELETE"] };

  // 1) FleetAgent de WhatsApp (Nik) — UN cerebro/persona para toda denik.me. SIN
  //    DENIK_API_KEY en persona: la key de cada org se inyecta PER-MENSAJE
  //    (groupKeys → routeMessage), así Nik en cada grupo solo ve datos de SU org.
  log(`\n⏳ creando FleetAgent de WhatsApp (Nik) bajo ${BRENDA_EMAIL}…`);
  const fleetAgent = await createFleetAgent(ctx, {
    name: "denik-wa",
    workerTemplate: "claude-worker",
    persona: { env: { DENIK_BASE_URL, SYSTEM_PROMPT } },
    oauthSecretName: "CLAUDE_CODE_OAUTH_TOKEN",
  });
  log("✅ FleetAgent creado:");
  log(`   EASYBITS_WA_FLEET_ID=${fleetAgent.id}`);
  log(`   EASYBITS_WA_FLEET_TOKEN=${fleetAgent.token}`);
  log("   → parea el número de brenda en /dash/flota antes de crear grupos.");

  // 2) Chatbot web de prueba (claude-worker standalone, 1 agente = 1 org → la
  //    DENIK_API_KEY sí va en su env).
  log(`\n⏳ creando chatbot web de prueba…`);
  const agent = await createAgent(ctx, {
    template: "claude-worker" as any,
    name: "denik-test",
    env: { DENIK_API_KEY, DENIK_BASE_URL, SYSTEM_PROMPT },
  });
  log("✅ Chatbot creado:");
  log(`   agentId=${agent.agentId}`);
  log(`   embedToken=${agent.embedToken}`);

  log("\nListo. Wirea EASYBITS_WA_FLEET_ID/TOKEN en denik y prueba el chatbot.");
  log("(La delegación a fixtergeek la maneja el agente de 'compartidos'.)");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  });
