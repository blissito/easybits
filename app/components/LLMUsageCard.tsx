import { useEffect, useState } from "react";
import { BrutalButton } from "~/components/common/BrutalButton";

interface LLMBalance {
  is_available: boolean;
  balance_infos: Array<{
    currency: string;
    total_balance: string;
    total_balance_human: string;
    granted_balance: string;
    granted_balance_human: string;
    topped_up_balance: string;
    topped_up_balance_human: string;
    used: string;
    used_human: string;
    remaining: string;
    remaining_human: string;
    reset_at: string | null;
  }>;
}

export function LLMUsageCard() {
  const [balance, setBalance] = useState<LLMBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [recharging, setRecharging] = useState(false);

  async function fetchBalance() {
    const res = await fetch("/api/v2/llm/balance");
    if (res.ok) setBalance(await res.json());
    setLoading(false);
  }

  async function recargar(tokens: number) {
    setRecharging(true);
    await fetch("/api/v2/llm/recharge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens }),
    });
    await fetchBalance();
    setRecharging(false);
  }

  useEffect(() => { fetchBalance(); }, []);

  if (loading) return <div className="h-20 bg-gray-100 rounded-xl animate-pulse" />;
  if (!balance?.balance_infos?.[0]) return null;

  const b = balance.balance_infos[0];
  const used = Number(b.used);
  const total = Number(b.total_balance);
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const isLow = pct > 80;

  return (
    <div className="border-2 border-black rounded-xl bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold">DeepSeek V4 Pro</h3>
          <p className="text-xs text-iron mt-0.5">
            {b.granted_balance_human} plan · {b.topped_up_balance_human} recargados
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full border font-bold ${
          balance.is_available
            ? "border-green-400 bg-green-50 text-green-700"
            : "border-red-400 bg-red-50 text-red-700"
        }`}>
          {balance.is_available ? "Activo" : "Agotado"}
        </span>
      </div>

      {/* Barra de uso */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-iron mb-1">
          <span>{b.used_human} usados</span>
          <span>{b.remaining_human} restantes</span>
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
          <span>{b.total_balance_human}</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "Plan", value: b.granted_balance_human },
          { label: "Recargas", value: b.topped_up_balance_human },
          { label: "Total", value: b.total_balance_human },
        ].map((s) => (
          <div key={s.label} className="text-center border border-gray-200 rounded-lg py-2">
            <div className="text-xs text-iron">{s.label}</div>
            <div className="text-sm font-bold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Reset info */}
      {b.reset_at && (
        <p className="text-[10px] text-iron/50 mb-3 text-center">
          Renueva {new Date(b.reset_at).toLocaleDateString("es-MX", {
            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
          })}
        </p>
      )}

      {/* Recargas rápidas */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: "5M", tokens: 5_000_000 },
          { label: "10M", tokens: 10_000_000 },
          { label: "50M", tokens: 50_000_000 },
        ].map((p) => (
          <BrutalButton
            key={p.tokens}
            onClick={() => recargar(p.tokens)}
            disabled={recharging}
            className="text-xs !py-1 !px-3"
          >
            +{p.label}
          </BrutalButton>
        ))}
      </div>
    </div>
  );
}
