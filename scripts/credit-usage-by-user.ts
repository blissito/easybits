/**
 * What consumed a user's credits.
 * Run: npx tsx scripts/credit-usage-by-user.ts fixtergeek@gmail.com
 */
import { PrismaClient } from "@prisma/client";
import { getUserPlan, PLANS } from "../app/lib/plans";

const db = new PrismaClient();
const email = process.argv[2] || "fixtergeek@gmail.com";

async function main() {
  const user = await db.user.findFirst({
    where: { email },
    select: {
      id: true,
      email: true,
      roles: true,
      metadata: true,
      aiGenerationsCount: true,
      aiGenerationsBonus: true,
      aiGenerationsResetAt: true,
    },
  });
  if (!user) {
    console.log(`No user found for ${email}`);
    return;
  }

  const plan = getUserPlan(user as any);
  const monthlyLimit = PLANS[plan].aiGenerationsPerMonth;

  console.log("\n=== User ===");
  console.log({
    email: user.email,
    plan,
    monthlyLimit,
    monthlyUsed: user.aiGenerationsCount,
    bonus: user.aiGenerationsBonus,
    resetAt: user.aiGenerationsResetAt?.toISOString(),
  });

  // Window: since last reset (current billing month)
  const sinceReset = user.aiGenerationsResetAt ?? new Date(0);

  const [byType, byModel, recent, totalThisCycle] = await Promise.all([
    db.aiGenerationLog.groupBy({
      by: ["product", "type"],
      where: { userId: user.id, createdAt: { gte: sinceReset } },
      _count: true,
      _sum: { cost: true, inputTokens: true, outputTokens: true },
    }),
    db.aiGenerationLog.groupBy({
      by: ["modelId"],
      where: { userId: user.id, createdAt: { gte: sinceReset } },
      _count: true,
      _sum: { cost: true, inputTokens: true, outputTokens: true },
    }),
    db.aiGenerationLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        product: true, type: true, modelId: true, cost: true,
        source: true, pageCount: true, createdAt: true, resourceId: true,
      },
    }),
    db.aiGenerationLog.aggregate({
      where: { userId: user.id, createdAt: { gte: sinceReset } },
      _sum: { cost: true },
      _count: true,
    }),
  ]);

  console.log(`\n=== This billing cycle (since ${sinceReset.toISOString().slice(0,10)}) ===`);
  console.log(`Total credits spent: ${totalThisCycle._sum.cost ?? 0} across ${totalThisCycle._count} operations`);

  console.log("\n=== Credits by product x type (this cycle) ===");
  console.table(
    byType
      .map((r) => ({
        product: r.product,
        type: r.type,
        ops: r._count,
        credits: r._sum.cost ?? 0,
      }))
      .sort((a, b) => b.credits - a.credits)
  );

  console.log("\n=== Credits by model (this cycle) ===");
  console.table(
    byModel
      .map((r) => ({
        model: r.modelId || "(null)",
        ops: r._count,
        credits: r._sum.cost ?? 0,
        inTok: r._sum.inputTokens ?? 0,
        outTok: r._sum.outputTokens ?? 0,
      }))
      .sort((a, b) => b.credits - a.credits)
  );

  console.log("\n=== Last 25 operations (all time) ===");
  console.table(
    recent.map((r) => ({
      date: r.createdAt.toISOString().slice(0, 16).replace("T", " "),
      product: r.product,
      type: r.type,
      model: r.modelId || "—",
      cost: r.cost,
      src: r.source || "—",
      pages: r.pageCount ?? "—",
      resId: r.resourceId?.slice(-8) || "—",
    }))
  );
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
