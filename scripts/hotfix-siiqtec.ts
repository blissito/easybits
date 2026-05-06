import { db } from "../app/.server/db";

async function main() {
  const email = "siiqtec@gmail.com";
  const customerId = "cus_UT4Iodbq5TdCYf";
  const plan = "Mega";

  const before = await db.user.findUnique({
    where: { email },
    select: { id: true, roles: true, customer: true, stripeIds: true },
  });
  console.log("BEFORE:", JSON.stringify(before, null, 2));

  if (!before) throw new Error("User not found");

  const PLAN_ROLES = ["Byte", "Mega", "Tera", "Spark", "Flow", "Studio"];
  const cleanRoles = (before.roles || []).filter((r) => !PLAN_ROLES.includes(r));
  const newRoles = [...cleanRoles, plan];

  const stripeIds = (before.stripeIds || []).includes(customerId)
    ? before.stripeIds
    : [...(before.stripeIds || []), customerId];

  const updated = await db.user.update({
    where: { email },
    data: {
      roles: newRoles,
      customer: customerId,
      stripeIds,
    },
    select: { id: true, roles: true, customer: true, stripeIds: true },
  });

  console.log("AFTER:", JSON.stringify(updated, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
