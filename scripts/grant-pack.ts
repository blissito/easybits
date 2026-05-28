/**
 * Grant a generation pack to a user (same effect as the Stripe webhook).
 * Run: npx tsx scripts/grant-pack.ts <email> <packId>
 */
import { PrismaClient } from "@prisma/client";
import { GENERATION_PACKS, getUserPlan } from "../app/lib/plans";

const db = new PrismaClient();
const email = process.argv[2];
const packId = process.argv[3];

async function main() {
  if (!email || !packId) {
    console.log("Usage: npx tsx scripts/grant-pack.ts <email> <packId>");
    return;
  }
  const pack = GENERATION_PACKS.find((p) => p.id === packId);
  if (!pack) {
    console.log(`Unknown pack: ${packId}. Available: ${GENERATION_PACKS.map((p) => p.id).join(", ")}`);
    return;
  }

  const user = await db.user.findFirst({
    where: { email },
    select: { id: true, email: true, roles: true, metadata: true, aiGenerationsBonus: true },
  });
  if (!user) {
    console.log(`No user found for ${email}`);
    return;
  }

  const plan = getUserPlan(user as any);
  const generations = pack.prices[plan] != null ? pack.generations : pack.generations;
  const before = user.aiGenerationsBonus || 0;

  const updated = await db.user.update({
    where: { id: user.id },
    data: { aiGenerationsBonus: { increment: generations } },
    select: { aiGenerationsBonus: true },
  });

  await db.aiGenerationLog.create({
    data: {
      userId: user.id,
      type: "pack_purchase",
      product: "admin",
      pageCount: generations,
      source: "bonus",
    },
  });

  const price = pack.prices[plan] ?? 0;
  const order = await db.order.create({
    data: {
      type: "credit_pack",
      customer_email: user.email,
      customerId: user.id,
      price,
      currency: "mxn",
      total: `$ ${price.toFixed(2)} MXN`,
      status: "Paid",
      productId: packId,
      note: `Manual grant (admin) — ${packId}`,
      items: [
        {
          kind: "credit_pack",
          refId: packId,
          label: `${packId} — ${generations} créditos`,
          quantity: 1,
          unitPrice: price,
        },
      ],
    },
    select: { id: true },
  });

  console.log("\n=== Pack granted ===");
  console.log({
    email: user.email,
    packId,
    price: price + " MXN",
    creditsAdded: generations,
    bonusBefore: before,
    bonusAfter: updated.aiGenerationsBonus,
    orderId: order.id,
  });
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
