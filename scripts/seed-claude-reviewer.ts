/**
 * Cuenta de revisión para el directorio de conectores de Claude (claude-review@easybits.cloud).
 * Crea o actualiza la cuenta (rota la contraseña en cada corrida), le pone una contraseña ALEATORIA para /login/revisor y emite una
 * llave temporal (24 h) para sembrar datos de muestra por el MCP real. La contraseña y la llave
 * se escriben en el archivo que se pase como argumento (0600), nunca a la consola.
 * ⚠️ Pega contra la DB de PROD (.env).
 *   npx tsx scripts/seed-claude-reviewer.ts <archivo-de-salida>
 */
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import { db } from "../app/.server/db";
import { createApiKey } from "../app/.server/iam";
import { hashReviewerPassword } from "../app/.server/reviewerAuth";

const EMAIL = "claude-review@easybits.cloud";
const out = process.argv[2];
if (!out) throw new Error("falta el archivo de salida");

async function main() {
  const password = crypto.randomBytes(18).toString("base64url");
  const user = await db.user.upsert({
    where: { email: EMAIL },
    create: {
      email: EMAIL,
      verified_email: true,
      confirmed: true,
      displayName: "Claude Reviewer",
      host: "claude-review",
      publicKey: crypto.randomUUID(),
      reviewerPasswordHash: hashReviewerPassword(password),
      // Perfil ya contestado: el revisor entra directo al panel, sin onboarding.
      metadata: { customer_type: "developer", asset_types: ["archivo"] },
    },
    update: {
      reviewerPasswordHash: hashReviewerPassword(password),
      metadata: { customer_type: "developer", asset_types: ["archivo"] },
    },
  });
  const key = await createApiKey(user.id, {
    name: "seed-claude-reviewer (temporal)",
    scopes: ["READ", "WRITE", "DELETE"],
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
  });
  fs.writeFileSync(out, JSON.stringify({ email: EMAIL, password, userId: user.id, apiKeyId: key.id, apiKey: key.raw }, null, 2), { mode: 0o600 });
  console.log(`cuenta ${EMAIL} (${user.id}) lista; credenciales en ${out}`);
}

main().finally(() => db.$disconnect());
