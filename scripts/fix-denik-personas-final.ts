/**
 * Estado FINAL limpio de los personas de Denik (reemplaza al swap anterior).
 *
 * Descubrimiento clave: el systemPrompt POR-CANAL (groupConfigs[cfgId].systemPrompt)
 * se APPENDEA a la persona base (fleetAgentOperations.ts:1747), no la reemplaza, y NO
 * cae a "*". Palanca limpia y escalable:
 *   · Persona BASE del agente con baileys = ADMIN → TODO grupo de WhatsApp (presentes
 *     Y FUTUROS, cada jid nuevo) hereda comportamiento admin sin config por-grupo.
 *   · Override SOLO del canal "web" → PÚBLICO → repara la burbuja de landing (todas las
 *     burbujas web-<orgId>-<sid> normalizan a cfgId "web") con UNA sola palanca.
 *
 * Superficies resultantes:
 *   · 6a3da33 (baileys: grupos admin + burbuja pública)
 *       - grupos WhatsApp (jids)  → base ADMIN                         → admin ✓
 *       - burbuja web (cfgId web) → base ADMIN + override PÚBLICO + append público → público ✓
 *   · 6a5549 (Nik Admin, /dash/asistente, cfgId web) → base ADMIN + append admin → admin ✓
 *
 * Nombres alineados con los env de denik (EASYBITS_FLEET_ID=6a3da33="Nik";
 * EASYBITS_FLEET_ID_ADMIN=6a5549="Nik Admin"). Preserva baileys, groupKeys,
 * hasOwnNumber, hiddenChannels, enabledGroups, y el resto de persona.env.
 *
 * ⚠️ SYSTEM_PROMPT es spawn-baked → recicla la caja para aplicar ya.
 *
 * Run:  npx tsx scripts/fix-denik-personas-final.ts           (dry-run)
 *       npx tsx scripts/fix-denik-personas-final.ts --apply
 */
import "dotenv/config";
import { db } from "../app/.server/db";

const APPLY = process.argv.includes("--apply");
const BAILEYS = "6a3da33701649d68258e42da"; // número + grupos admin + burbuja pública
const DASH = "6a55493ad533fe2daf755211";    // Nik Admin, /dash/asistente

const ADMIN_PROMPT = [
  "Eres el asistente personal del dueño y el equipo de un negocio que usa denik.me.",
  "Trabajas en su canal privado de administración (grupo de WhatsApp del equipo o el panel), NO con clientes finales.",
  "",
  "## Qué puedes hacer (tools mcp__denik__*, scope admin)",
  "- Buscar y consultar contactos/clientes.",
  "- Consultar servicios, disponibilidad y horarios.",
  "- Crear, editar, reagendar y cancelar reservas/citas.",
  "- Agregar o actualizar datos de un contacto. Puedes ESCRIBIR y AGENDAR cuando te lo pidan.",
  "",
  "## Cómo trabajas",
  "- SIEMPRE usa las herramientas para leer o cambiar datos reales. Nunca inventes disponibilidad, precios, contactos ni confirmaciones.",
  "- Antes de crear/modificar/cancelar una reserva confirma en una línea los datos clave (cliente, servicio, fecha y hora) y ejecútalo. Si falta un dato, pídelo puntual.",
  "- REGLA CRÍTICA: nunca digas que agendaste, guardaste, cancelaste o actualizaste algo si NO llamaste la herramienta correspondiente y devolvió éxito. Si falló, dilo claro.",
  "- Responde en español, claro y directo.",
].join("\n");

const WEB_PUBLIC_OVERRIDE = [
  "── ANULACIÓN DE ROL PARA ESTE CANAL (burbuja web pública en la landing) ──",
  "IGNORA cualquier instrucción previa sobre ser asistente interno o de administración.",
  "Aquí hablas ÚNICAMENTE con CLIENTES FINALES del negocio. Tu único trabajo es informar",
  "sobre servicios y disponibilidad y ayudar a AGENDAR con tus herramientas públicas.",
  "NO gestionas contactos, NO ves ni editas datos internos, NO administras la cuenta ni",
  "los servicios. Si te piden algo administrativo, di amablemente que eso lo hace el dueño",
  "desde su panel. Sé cálido, breve y orientado a atención al cliente.",
].join("\n");

async function main() {
  console.log(APPLY ? "MODO: --apply (PROD)\n" : "MODO: dry-run (usa --apply)\n");

  const rows = await db.fleetAgent.findMany({
    where: { id: { in: [BAILEYS, DASH] } },
    select: { id: true, name: true, assistantName: true, persona: true, groupConfigs: true },
  });

  const plan = [
    { id: BAILEYS, name: "Nik", assistant: "Nik", webOverride: true },
    { id: DASH, name: "Nik Admin", assistant: "Nik Admin", webOverride: false },
  ];

  for (const t of plan) {
    const row = rows.find((r) => r.id === t.id)!;
    const p = (row.persona ?? {}) as any;
    const gc = (row.groupConfigs ?? {}) as any;

    const nextPersona = {
      ...p,
      name: t.name,
      env: { ...p.env, ASSISTANT_NAME: t.assistant, SYSTEM_PROMPT: ADMIN_PROMPT },
    };
    let nextGc = gc;
    if (t.webOverride) {
      nextGc = { ...gc, web: { ...(gc.web ?? {}), systemPrompt: WEB_PUBLIC_OVERRIDE } };
    }

    console.log(`── ${t.id} ──`);
    console.log(`  name: "${row.name}" → "${t.name}" | assistantName: "${row.assistantName}" → "${t.assistant}"`);
    console.log(`  persona.name: "${p.name}" → "${t.name}" | env preservado: ${JSON.stringify(Object.keys(nextPersona.env))}`);
    console.log(`  base SYSTEM_PROMPT → ADMIN (${ADMIN_PROMPT.length} chars)`);
    console.log(`  web override: ${t.webOverride ? `PÚBLICO (${WEB_PUBLIC_OVERRIDE.length} chars)` : "(sin cambio)"}`);
    console.log(`  gc.web.connectedAt preservado: ${nextGc.web?.connectedAt ?? null}`);

    if (APPLY) {
      await db.fleetAgent.update({
        where: { id: t.id },
        data: { name: t.name, assistantName: t.assistant, persona: nextPersona as any, groupConfigs: nextGc as any },
      });
      console.log("  ✅ aplicado\n");
    } else console.log("  (dry-run)\n");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error("❌", e); process.exit(1); });
