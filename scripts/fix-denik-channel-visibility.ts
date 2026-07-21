/**
 * One-off (idempotente): corrige la VISIBILIDAD de canales de los dos FleetAgents de
 * Denik en /dash/flota. Es un fix de DISPLAY — no toca ruteo, tokens, ni persona.env.
 *
 * Contexto (ver denik CLAUDE.md "Nik por WhatsApp"): estrategia 2-agentes, UN número:
 *   · Nik (público)  → dueño del número Baileys + hospeda TODOS los grupos de WhatsApp
 *                      (+ burbuja web pública). Su canal real = baileys (conectado).
 *   · Nik Admin      → SOLO canal web `web-admin-<orgId>` (asistente del dueño en
 *                      /dash/asistente). NO tiene socket baileys.
 *
 * BUG: `persona.hiddenChannels` estaba INVERTIDO respecto al uso real →
 *   · Nik público ocultaba "baileys" → su canal conectado (2 grupos) NO se veía en el HUD.
 *   · Nik Admin ocultaba "web" → escondía su canal real y dejaba visible un baileys
 *     fantasma (nunca conectado). De ahí "el canal de grupos no aparece conectado".
 *
 * FIX (solo override de visibilidad + backfill del indicador web):
 *   · Nik público  → hiddenChannels: []            (mostrar su baileys/grupos conectados)
 *   · Nik Admin    → hiddenChannels: ["baileys"]   (mostrar web, ocultar baileys fantasma)
 *                    + groupConfigs.web.connectedAt (responde en prod → marcar "Recibiendo")
 *
 * persona.env NUNCA se toca (spread preservado) → no afecta el spawn.
 *
 * Run:  npx tsx scripts/fix-denik-channel-visibility.ts           (dry-run, solo imprime)
 *       npx tsx scripts/fix-denik-channel-visibility.ts --apply   (escribe a PROD)
 */
import "dotenv/config";
import { db } from "../app/.server/db";

const APPLY = process.argv.includes("--apply");

const NIK_PUBLIC = "6a3da33701649d68258e42da";
const NIK_ADMIN = "6a55493ad533fe2daf755211";

type Target = {
  id: string;
  name: string;
  hiddenChannels: string[];
  stampWebConnected: boolean;
};

const TARGETS: Target[] = [
  { id: NIK_PUBLIC, name: "Nik (público)", hiddenChannels: [], stampWebConnected: false },
  { id: NIK_ADMIN, name: "Nik Admin", hiddenChannels: ["baileys"], stampWebConnected: true },
];

async function main() {
  console.log(APPLY ? "MODO: --apply (escribe a PROD)\n" : "MODO: dry-run (sin escribir; usa --apply para aplicar)\n");
  for (const t of TARGETS) {
    const fa = await db.fleetAgent.findUnique({
      where: { id: t.id },
      select: { id: true, name: true, persona: true, groupConfigs: true },
    });
    if (!fa) { console.log(`⚠️  ${t.name} (${t.id}) NO encontrado — skip\n`); continue; }

    const persona = ((fa.persona ?? {}) as Record<string, any>);
    const gc = ((fa.groupConfigs ?? {}) as Record<string, any>);

    console.log(`── ${t.name} (${t.id}) ──`);
    console.log("  hiddenChannels ANTES:", JSON.stringify(persona.hiddenChannels ?? null));
    console.log("  gc.web.connectedAt ANTES:", gc.web?.connectedAt ?? null);

    const nextPersona = { ...persona, hiddenChannels: t.hiddenChannels };
    let nextGc = gc;
    if (t.stampWebConnected && !gc.web?.connectedAt) {
      nextGc = { ...gc, web: { ...(gc.web ?? {}), connectedAt: new Date().toISOString() } };
    }

    console.log("  hiddenChannels DESPUÉS:", JSON.stringify(nextPersona.hiddenChannels));
    console.log("  gc.web.connectedAt DESPUÉS:", nextGc.web?.connectedAt ?? null);

    if (APPLY) {
      await db.fleetAgent.update({
        where: { id: t.id },
        data: { persona: nextPersona as any, groupConfigs: nextGc as any },
      });
      console.log("  ✅ aplicado\n");
    } else {
      console.log("  (dry-run: no escrito)\n");
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error("❌", e); process.exit(1); });
