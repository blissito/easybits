import { useEffect, useState } from "react";
import { BrutalButton } from "~/components/common/BrutalButton";

export interface LlmUsageProps {
  /** Tokens usados en este ciclo */
  used: number;
  /** Límite del plan (sin bonus) */
  planLimit: number;
  /** Bonus comprado (recargas vía packs) */
  bonus: number;
  /** Plan del usuario */
  plan: string;
  /** Fecha de reseteo */
  resetAt: Date | null;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

/**
 * Barra de uso de tokens LLM. Puramente presentacional — recibe datos por props.
 * Los botones de recarga redirigen al tab de tokens en /dash/packs.
 */
export function LlmUsageBar({ used, planLimit, bonus, plan, resetAt }: LlmUsageProps) {
  const total = planLimit + bonus;
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const remaining = Math.max(0, total - used);
  const isLow = pct > 80;

  return (
    <div className="border-2 border-black rounded-xl bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-lg font-bold">Tokens LLM</h3>
          <p className="text-xs text-iron mt-0.5">
            Plan {plan} · {formatTokens(planLimit)}/mes
          </p>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full border font-bold ${
            remaining > 0
              ? "border-green-400 bg-green-50 text-green-700"
              : "border-red-400 bg-red-50 text-red-700"
          }`}
        >
          {remaining > 0 ? "Activo" : "Agotado"}
        </span>
      </div>

      {/* Barra de uso */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-iron mb-1">
          <span>{formatTokens(used)} usados</span>
          <span>{formatTokens(remaining)} restantes</span>
        </div>
        <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden border border-gray-200">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isLow ? "bg-red-500" : pct > 60 ? "bg-yellow-500" : "bg-green-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-iron/60 mt-0.5">
          <span>0</span>
          <span>{formatTokens(total)}</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "Plan", value: formatTokens(planLimit) },
          { label: "Recargas", value: formatTokens(bonus) },
          { label: "Total", value: formatTokens(total) },
        ].map((s) => (
          <div key={s.label} className="text-center border border-gray-200 rounded-lg py-2">
            <div className="text-xs text-iron">{s.label}</div>
            <div className="text-sm font-bold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Reset info */}
      {resetAt && (
        <p className="text-[10px] text-iron/50 mb-3 text-center">
          Renueva{" "}
          {new Date(resetAt).toLocaleDateString("es-MX", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}

      {/* Recarga CTA */}
      <a href="/dash/packs?tab=tokens" className="mt-auto">
        <BrutalButton className="w-full text-sm" containerClassName="w-full">
          Comprar tokens
        </BrutalButton>
      </a>
    </div>
  );
}

/**
 * Wrapper that fetches its own data. Used on standalone pages like
 * /dash/developer/llm (legacy, now redirects to /dash/packs).
 */
export function LLMUsageCard() {
  const [data, setData] = useState<LlmUsageProps | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v2/llm/balance")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.balance_infos?.[0]) {
          const b = json.balance_infos[0];
          setData({
            used: Number(b.used),
            planLimit: Number(b.granted_balance),
            bonus: Number(b.topped_up_balance),
            plan: "",
            resetAt: b.reset_at ? new Date(b.reset_at) : null,
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />;
  if (!data) return null;

  return <LlmUsageBar {...data} />;
}
