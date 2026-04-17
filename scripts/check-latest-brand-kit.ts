import { db } from "../app/.server/db";
async function main() {
  const kits = await db.brandKit.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  console.log(JSON.stringify(kits, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
