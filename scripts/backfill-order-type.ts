/**
 * One-time migration:
 *  1. Backfill type="asset_sale" on existing orders (all current orders are asset sales).
 *  2. Create the missing credit_pack Order for the studio_pro grant already credited
 *     to fixtergeek@gmail.com (the grant predated grant-pack.ts writing Orders).
 * Run: npx tsx scripts/backfill-order-type.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const backfilled = await db.order.updateMany({
    where: { type: null },
    data: { type: "asset_sale" },
  });
  console.log(`Backfilled type on ${backfilled.count} orders`);

  const user = await db.user.findFirst({
    where: { email: "fixtergeek@gmail.com" },
    select: { id: true, email: true },
  });
  if (!user) {
    console.log("fixtergeek user not found — skipping studio_pro order");
    return;
  }

  const existing = await db.order.findFirst({
    where: { customerId: user.id, type: "credit_pack", productId: "pack_studio_pro" },
    select: { id: true },
  });
  if (existing) {
    console.log(`studio_pro order already exists: ${existing.id}`);
    return;
  }

  const price = 3799;
  const order = await db.order.create({
    data: {
      type: "credit_pack",
      customer_email: user.email,
      customerId: user.id,
      price,
      currency: "mxn",
      total: `$ ${price.toFixed(2)} MXN`,
      status: "Paid",
      productId: "pack_studio_pro",
      note: "Manual grant (admin) — pack_studio_pro",
      items: [
        {
          kind: "credit_pack",
          refId: "pack_studio_pro",
          label: "pack_studio_pro — 75000 créditos",
          quantity: 1,
          unitPrice: price,
        },
      ],
    },
    select: { id: true },
  });
  console.log(`Created studio_pro order: ${order.id}`);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
