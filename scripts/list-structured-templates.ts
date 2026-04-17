import { db } from "../app/.server/db";

async function main() {
  const email = process.argv[2] || "fixtergeek@gmail.com";
  const user = await db.user.findFirst({ where: { email } });
  if (!user) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }
  const templates = await db.mcpTemplate.findMany({
    where: { OR: [{ ownerId: user.id }, { isPublic: true }] },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, description: true, isPublic: true, ownerId: true, updatedAt: true },
  });
  console.log(`\nUser: ${email} (${user.id})\n`);
  console.log(`Templates visible to this user (${templates.length}):\n`);
  for (const t of templates) {
    const mine = t.ownerId === user.id ? "[MINE]" : "[PUBLIC]";
    console.log(` ${mine} ${t.id}  ${t.name}`);
    if (t.description) console.log(`    ${t.description}`);
    console.log(`    updated: ${t.updatedAt.toISOString()}`);
  }
  console.log();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
