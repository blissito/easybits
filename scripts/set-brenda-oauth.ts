/**
 * Copia CLAUDE_CODE_OAUTH_TOKEN de ~/nanoclaw/.env al vault EasyBits de brenda
 * (cerebro plano OAuth Max para sus agentes/pool claude-worker).
 * Run: cd ~/easybits && npx tsx scripts/set-brenda-oauth.ts   [WRITE prod DB]
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { db } from "../app/.server/db";
import { createSecret } from "../app/.server/core/secretOperations";

const EMAIL = process.env.DENIK_OWNER_EMAIL || "brenda@fixter.org";

function readEnvVar(file: string, key: string): string {
  for (const line of readFileSync(file, "utf-8").split("\n")) {
    const m = line.match(new RegExp(`^${key}=(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error(`${key} not found in ${file}`);
}

async function main() {
  const token = readEnvVar(join(homedir(), "nanoclaw/.env"), "CLAUDE_CODE_OAUTH_TOKEN");
  const user = await db.user.findFirst({ where: { email: EMAIL } });
  if (!user) throw new Error(`EasyBits user ${EMAIL} no existe`);
  await createSecret(user.id, { name: "CLAUDE_CODE_OAUTH_TOKEN", value: token });
  console.log(`✅ CLAUDE_CODE_OAUTH_TOKEN guardado en el vault de ${EMAIL} (len=${token.length})`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  });
