/**
 * Suma consultas web (User.webQueriesBonus) a una cuenta.
 * Run: npx tsx scripts/grant-web-queries.ts <email> <cantidad>
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const email = process.argv[2];
const add = Number(process.argv[3] || 0);
if (!email || !add) throw new Error("uso: grant-web-queries.ts <email> <cantidad>");

const u = await db.user.findUnique({ where: { email }, select: { id: true, webQueriesBonus: true } });
if (!u) throw new Error(`sin usuario ${email}`);
const r = await db.user.update({
  where: { id: u.id },
  data: { webQueriesBonus: (u.webQueriesBonus ?? 0) + add },
  select: { webQueriesBonus: true },
});
console.log(`${email}: ${u.webQueriesBonus ?? 0} → ${r.webQueriesBonus}`);
await db.$disconnect();
