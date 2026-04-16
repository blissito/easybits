/**
 * One-shot migration: mark all existing Websites as subdomainEnabled=true
 * to preserve current behavior after the path-based-default switch.
 *
 * Run: npx tsx scripts/migrate-subdomain-default.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const before = await db.website.count();
  const result = await db.website.updateMany({
    where: { subdomainEnabled: false },
    data: { subdomainEnabled: true },
  });
  console.log(
    `✓ Migrated ${result.count}/${before} websites to subdomainEnabled=true`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
