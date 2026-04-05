import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { getUserPlan, PLANS, NEXT_PLAN, formatPrice, type PlanKey } from "~/lib/plans";
import { getStorageStats } from "~/components/common/StorageBar";
import { checkAiGenerationLimit } from "~/.server/aiGenerationLimit";
import type { Route } from "./+types/stats";
import StatsComponent from "~/components/stats/StatsComponent";

function subMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() - months);
  return result;
}

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const planKey = getUserPlan(user);
  const usedGB = await getStorageStats(user.id, db);
  const genLimit = await checkAiGenerationLimit(user.id);

  const [fileCount, landingCount, presentationCount, documentCount, databaseCount, recentFiles] = await Promise.all([
    db.file.count({ where: { ownerId: user.id, status: { not: "DELETED" } } }),
    db.landing.count({ where: { ownerId: user.id, version: { not: 4 } } }),
    db.presentation.count({ where: { ownerId: user.id } }),
    db.landing.count({ where: { ownerId: user.id, version: 4 } }),
    db.database.count({ where: { userId: user.id } }),
    db.file.findMany({
      where: { ownerId: user.id, status: { not: "DELETED" }, NOT: { name: { startsWith: "sites/" } } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, name: true, size: true, createdAt: true, contentType: true },
    }),
  ]);

  // Activity history by month (last 3 months)
  const months = Array.from({ length: 3 }).map((_, i) => {
    const d = subMonths(new Date(), 2 - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const genByMonth: Record<string, { documents: number; landings: number; presentations: number }> = {};
  const filesByMonth: number[] = [];

  await Promise.all(
    months.map(async (month, idx) => {
      const [year, m] = month.split("-").map(Number);
      const start = new Date(year, m - 1, 1);
      const end = new Date(year, m, 1);
      const where = { userId: user.id, createdAt: { gte: start, lt: end } as any };
      const [documents, landings, presentations, files] = await Promise.all([
        db.aiGenerationLog.count({ where: { ...where, product: "document" } }),
        db.aiGenerationLog.count({ where: { ...where, product: "landing" } }),
        db.aiGenerationLog.count({ where: { ...where, product: "presentation" } }),
        db.file.count({ where: { ownerId: user.id, status: { not: "DELETED" }, createdAt: { gte: start, lt: end } } }),
      ]);
      genByMonth[month] = { documents, landings, presentations };
      filesByMonth[idx] = files;
    })
  );

  // Chart data for LineChart
  const monthLabels = months.map((m) => {
    const [year, mo] = m.split("-").map(Number);
    const d = new Date(Date.UTC(year, mo - 1));
    const raw = new Intl.DateTimeFormat("es", { month: "short" }).format(d);
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  });

  const chartData = {
    labels: monthLabels,
    datasets: [
      {
        label: "AI Generaciones",
        data: months.map((m) => {
          const g = genByMonth[m] || { documents: 0, landings: 0, presentations: 0 };
          return g.documents + g.landings + g.presentations;
        }),
        borderColor: "#9870ED",
        backgroundColor: "rgba(152, 112, 237, 0.1)",
        borderWidth: 2,
        pointBorderColor: "#9870ED",
        pointBackgroundColor: "#9870ED",
        tension: 0.3,
        fill: true,
      },
      {
        label: "Archivos subidos",
        data: filesByMonth,
        borderColor: "#34d399",
        backgroundColor: "rgba(52, 211, 153, 0.1)",
        borderWidth: 2,
        pointBorderColor: "#34d399",
        pointBackgroundColor: "#34d399",
        tension: 0.3,
        fill: true,
      },
    ],
  };

  return {
    user: { displayName: user.displayName, email: user.email },
    planKey,
    usedGB,
    genLimit: {
      used: genLimit.used,
      limit: genLimit.limit,
      remaining: genLimit.limit !== null ? Math.max(0, genLimit.limit - genLimit.used + genLimit.bonus) : null,
      bonus: genLimit.bonus,
    },
    counts: { files: fileCount, landings: landingCount, presentations: presentationCount, documents: documentCount, databases: databaseCount },
    recentFiles,
    genByMonth,
    months,
    chartData,
  };
};

export default function Stats({ loaderData }: Route.ComponentProps) {
  return <StatsComponent data={loaderData as any} />;
}
