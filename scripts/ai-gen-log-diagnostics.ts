/**
 * Diagnostic script: AiGenerationLog analysis for the last 7 days
 * Run: npx tsx scripts/ai-gen-log-diagnostics.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const DAYS = 7;

async function main() {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  console.log(`\n📊 AiGenerationLog — last ${DAYS} days (since ${since.toISOString()})\n`);

  const [byProductType, allLogs, slowest, byModel, nullCount] = await Promise.all([
    // 1. Totals by product × type
    db.aiGenerationLog.groupBy({
      by: ["product", "type"],
      where: { createdAt: { gte: since } },
      _count: true,
      _avg: { durationMs: true, inputTokens: true, outputTokens: true },
    }),
    // 2. All logs with durationMs for percentile calc
    db.aiGenerationLog.findMany({
      where: { createdAt: { gte: since }, durationMs: { not: null } },
      select: { product: true, type: true, durationMs: true },
    }),
    // 3. Top 10 slowest
    db.aiGenerationLog.findMany({
      where: { createdAt: { gte: since }, durationMs: { not: null } },
      orderBy: { durationMs: "desc" },
      take: 10,
      select: {
        product: true, type: true, modelId: true,
        durationMs: true, inputTokens: true, outputTokens: true,
        pageCount: true, createdAt: true, resourceId: true,
      },
    }),
    // 4. Token usage by model
    db.aiGenerationLog.groupBy({
      by: ["modelId"],
      where: { createdAt: { gte: since } },
      _count: true,
      _avg: { inputTokens: true, outputTokens: true, durationMs: true },
      _sum: { inputTokens: true, outputTokens: true },
    }),
    // 5. Missing durationMs
    db.aiGenerationLog.count({
      where: { createdAt: { gte: since }, durationMs: null },
    }),
  ]);

  // === 1. Totals ===
  console.log("═══ Generations by product × type ═══");
  console.table(
    byProductType.map((r) => ({
      product: r.product,
      type: r.type,
      count: r._count,
      "avg ms": r._avg.durationMs ? Math.round(r._avg.durationMs) : "—",
    }))
  );

  // === 2. Percentiles ===
  const groups = new Map<string, number[]>();
  for (const log of allLogs) {
    const key = `${log.product}:${log.type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(log.durationMs!);
  }

  console.log("\n═══ Duration percentiles (ms) ═══");
  const percentileRows: any[] = [];
  for (const [key, durations] of groups) {
    durations.sort((a, b) => a - b);
    const p = (pct: number) => durations[Math.floor(durations.length * pct)] || 0;
    const [product, type] = key.split(":");
    percentileRows.push({
      product,
      type,
      count: durations.length,
      avg: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      p50: p(0.5),
      p95: p(0.95),
      max: durations[durations.length - 1],
    });
  }
  console.table(percentileRows);

  // === 3. Slowest ===
  console.log("\n═══ Top 10 slowest generations ═══");
  console.table(
    slowest.map((r) => ({
      product: r.product,
      type: r.type,
      model: r.modelId || "—",
      "ms": r.durationMs,
      "sec": r.durationMs ? (r.durationMs / 1000).toFixed(1) : "—",
      inTok: r.inputTokens || "—",
      outTok: r.outputTokens || "—",
      pages: r.pageCount || "—",
      date: r.createdAt.toISOString().slice(0, 16),
      resourceId: r.resourceId?.slice(-8) || "—",
    }))
  );

  // === 4. By model ===
  console.log("\n═══ Token usage by model ═══");
  console.table(
    byModel.map((r) => ({
      model: r.modelId || "(null)",
      count: r._count,
      "avg inTok": r._avg.inputTokens ? Math.round(r._avg.inputTokens) : "—",
      "avg outTok": r._avg.outputTokens ? Math.round(r._avg.outputTokens) : "—",
      "total inTok": r._sum.inputTokens || "—",
      "total outTok": r._sum.outputTokens || "—",
      "avg ms": r._avg.durationMs ? Math.round(r._avg.durationMs) : "—",
    }))
  );

  // === 5. Missing ===
  console.log(`\n═══ Missing durationMs: ${nullCount} records ═══\n`);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
