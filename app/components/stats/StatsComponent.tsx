import { HiOutlineInformationCircle } from "react-icons/hi";
import { cn } from "~/utils/cn";
import { useAnimate } from "motion/react";
import { StorageBar } from "~/components/common/StorageBar";
import { PLANS, NEXT_PLAN, formatPrice, type PlanKey } from "~/lib/plans";
import { Link } from "react-router";
import LineChart from "~/components/charts/LineChart";

type StatsData = {
  user: { displayName?: string | null; email?: string | null };
  planKey: string;
  usedGB: number;
  genLimit: { used: number; limit: number | null; remaining: number | null; bonus: number };
  counts: { files: number; landings: number; presentations: number; documents: number; databases: number };
  recentFiles: Array<{ id: string; name: string; size: number; createdAt: string; contentType: string | null }>;
  genByMonth: Record<string, { documents: number; landings: number; presentations: number }>;
  months: string[];
  chartData: any;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1));
  const raw = new Intl.DateTimeFormat("es", { month: "short" }).format(date);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default function StatsComponent({ data }: { data: StatsData }) {
  const { user, planKey, usedGB, genLimit, counts, recentFiles, genByMonth, months, chartData } = data;
  const plan = PLANS[planKey as PlanKey];
  const nextPlan = NEXT_PLAN[planKey as PlanKey];

  const genPct = genLimit.limit ? Math.min((genLimit.used / genLimit.limit) * 100, 100) : 0;
  const genBarColor = genPct >= 90 ? "bg-red-500" : genPct >= 70 ? "bg-yellow-500" : "bg-brand-500";

  // Find max for chart scaling
  const monthTotals = months.map((m) => {
    const g = genByMonth[m] || { documents: 0, landings: 0, presentations: 0 };
    return g.documents + g.landings + g.presentations;
  });
  const chartMax = Math.max(...monthTotals, 1);

  return (
    <div className="min-h-screen px-4 md:pl-28 md:pr-8">
      <div className="max-w-7xl mx-auto flex flex-col pt-16 pb-10 md:pt-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl lg:text-4xl font-semibold">
            Hola, {user.displayName || user.email?.split("@")[0]}
          </h1>
          <p className="text-gray-500 mt-1">
            Plan <strong>{planKey}</strong> — {plan?.price ? `${formatPrice(plan.price)} MXN/mes` : "Gratis"}
            {nextPlan && (
              <Link to="/planes" className="ml-3 text-xs underline text-brand-500">
                Upgrade a {nextPlan}
              </Link>
            )}
          </p>
        </div>

        {/* Row 1: Storage */}
        <div className="mb-8">
          <StorageBar usedGB={usedGB} planKey={planKey} />
        </div>

        {/* Row 2: Usage cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <StatsCard
            title="AI Generaciones"
            amount={genLimit.limit !== null ? `${genLimit.used} / ${genLimit.limit}` : `${genLimit.used}`}
            className="bg-brand-100"
            tooltip={`${genLimit.remaining ?? "∞"} restantes${genLimit.bonus ? ` (+${genLimit.bonus} bonus)` : ""}`}
          >
            {genLimit.limit !== null && (
              <div className="h-1.5 bg-gray-200 w-full rounded-full mt-2 overflow-hidden">
                <div style={{ width: `${genPct}%` }} className={`${genBarColor} h-full rounded-full transition-all`} />
              </div>
            )}
          </StatsCard>
          <StatsCard
            title="Archivos"
            amount={String(counts.files)}
            className="bg-sky"
            tooltip="Archivos activos (sin papelera)"
          />
          <StatsCard
            title="Bases de datos"
            amount={String(counts.databases)}
            className="bg-lime"
            tooltip="Bases de datos libSQL creadas"
          />
          <StatsCard
            title="Landings"
            amount={String(counts.landings)}
            className="bg-linen"
            tooltip="Landing pages creadas"
          />
          <StatsCard
            title="Documentos"
            amount={String(counts.documents)}
            className="bg-rose"
            tooltip="Documentos AI creados"
          />
          <StatsCard
            title="Presentaciones"
            amount={String(counts.presentations)}
            className="bg-white"
            tooltip="Presentaciones creadas"
          />
        </div>

        {/* Row 3: AI Gen chart + Recent files */}
        <div className="grid grid-cols-12 gap-4">
          {/* Activity chart */}
          <div className="col-span-12 lg:col-span-7 border-2 border-black rounded-xl p-5 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <p className="font-bold text-sm mb-4">Actividad — últimos 3 meses</p>
            <div className="w-full h-[300px]">
              <LineChart data={chartData} />
            </div>
          </div>

          {/* Recent files */}
          <div className="col-span-12 lg:col-span-5 border-2 border-black rounded-xl p-5 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <p className="font-bold text-sm mb-4">Archivos recientes</p>
            {recentFiles.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Sin archivos todavía</p>
            ) : (
              <div className="space-y-2">
                {recentFiles.map((f) => (
                  <div key={f.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-bold truncate">{f.name}</p>
                      <p className="text-[10px] text-gray-400">{new Date(f.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap ml-2">{formatBytes(f.size)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-3 h-3 rounded-sm ${color}`} />
      <span className="text-[10px] text-gray-500">{label}</span>
    </div>
  );
}

const StatsCard = ({
  className,
  title,
  amount,
  tooltip,
  children,
}: {
  className: string;
  title: string;
  amount: string;
  tooltip: string;
  children?: React.ReactNode;
}) => {
  const [scope, animate] = useAnimate();
  const handleMouseEnter = () => {
    animate(scope.current, { y: 5, opacity: 1 }, { type: "spring" });
  };
  const handleMouseLeave = () => {
    animate(scope.current, { y: 0, opacity: 0 }, { type: "spring" });
  };
  return (
    <div className="relative group">
      <div className="absolute w-full inset-0 bg-black rounded-xl transition-transform duration-300 scale-100 group-hover:translate-x-1 group-hover:translate-y-1 opacity-0 group-hover:opacity-100" />
      <div
        className={cn(
          "rounded-xl z-10 text-black w-full border-black border-2 cursor-pointer relative transition-transform duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1 bg-white",
          className
        )}
      >
        <div className="p-5">
          <div className="text-sm flex items-center gap-1">
            <p className="font-bold">{title}</p>
            <div className="relative flex justify-center group/tip">
              <HiOutlineInformationCircle
                className="text-gray-400"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              />
              <div
                ref={scope}
                className="absolute opacity-0 -top-10 bg-black text-white text-[10px] w-[140px] p-1.5 rounded z-20 text-center"
              >
                {tooltip}
              </div>
            </div>
          </div>
          <p className="text-3xl font-bold mt-2">{amount}</p>
          {children}
        </div>
      </div>
    </div>
  );
};
