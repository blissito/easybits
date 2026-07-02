/**
 * One-off: mint an ADMIN API key for the Denik storage integration.
 * Writes the raw key to a file path given as argv[2] (never stdout).
 * Run: npx tsx scripts/mint-denik-key.ts /tmp/key.txt
 */
import { writeFileSync } from "node:fs";
import { db } from "../app/.server/db";
import { createApiKey } from "../app/.server/iam";

const EMAIL = "brenda@fixter.org";
const OUT = process.argv[2];

async function main() {
  if (!OUT) throw new Error("usage: tsx mint-denik-key.ts <outfile>");
  const user = await db.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error(`No user with email ${EMAIL}`);

  // Reuse an existing denik-storage key if present (idempotent-ish): otherwise mint.
  const key = await createApiKey(user.id, {
    name: "denik-storage",
    scopes: ["ADMIN"],
  });
  writeFileSync(OUT, key.raw, "utf-8");
  console.log(`OK userId=${user.id} keyId=${key.id} prefix=${key.prefix} → written to ${OUT}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
