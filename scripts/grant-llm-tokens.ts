/**
 * Regala tokens LLM (bonus, persistente, no expira) a cuentas por correo.
 * Uso: npx tsx scripts/grant-llm-tokens.ts <tokens> <email> [email...]
 *   npx tsx scripts/grant-llm-tokens.ts 5000000 alumno@x.com otro@y.com
 * Correos sin cuenta se reportan y se saltan: volver a correr cuando se registren.
 * Contexto: Byte (gratis) tiene 0 tokens desde 2026-07-01 (BYTE_PROMO_END) →
 * sin este grant, el proxy /api/v2/llm responde 402 al primer request.
 */
import { db } from "~/.server/db";
import { recargarLLMTokens } from "~/.server/llmTokenLimit";

(async () => {
  const [tokensArg, ...emails] = process.argv.slice(2);
  const tokens = Number(tokensArg);
  if (!tokens || !emails.length) { console.error("uso: <tokens> <email...>"); process.exit(1); }
  for (const email of emails) {
    const u = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (!u) { console.log(`✗ ${email} — sin cuenta, pendiente`); continue; }
    const l = await recargarLLMTokens(u.id, tokens);
    console.log(`✓ ${email} — +${tokens} → limit ${l.limit} remaining ${l.remaining} (${l.plan})`);
  }
  process.exit(0);
})();
