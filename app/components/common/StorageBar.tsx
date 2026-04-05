import { PLANS, type PlanKey } from "~/lib/plans";
import { Link } from "react-router";

export function StorageBar({ usedGB, planKey }: { usedGB: number; planKey: string }) {
  const maxGB = PLANS[planKey as PlanKey]?.storageGB ?? 0.1;
  const pct = Math.min((usedGB / maxGB) * 100, 100);
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-brand-500";
  const usedLabel = usedGB < 1 ? `${(usedGB * 1024).toFixed(1)} MB` : `${usedGB.toFixed(2)} GB`;
  const maxLabel = maxGB < 1 ? `${Math.round(maxGB * 1000)} MB` : `${maxGB} GB`;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold text-gray-500 whitespace-nowrap">
        {usedLabel} / {maxLabel}
      </span>
      <div className="h-2.5 bg-gray-200 w-full max-w-xs rounded-full border border-black relative overflow-hidden">
        <div
          style={{ width: `${pct}%` }}
          className={`${barColor} absolute inset-0 rounded-full transition-all`}
        />
      </div>
      <span className="text-xs font-bold text-gray-500">{pct.toFixed(0)}%</span>
      <Link to="/planes" className="text-xs underline text-brand-500 whitespace-nowrap">
        Mejorar plan
      </Link>
    </div>
  );
}

/** Server-side: get storage stats for a user */
export async function getStorageStats(userId: string, db: any) {
  const agg = await db.file.aggregate({
    where: { ownerId: userId, status: { not: "DELETED" } },
    _sum: { size: true },
  });
  return (agg._sum.size ?? 0) / 1024 / 1024 / 1024;
}
