import { useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { LuMemoryStick, LuCpu, LuHardDrive } from "react-icons/lu";
import { FLEET_BOX } from "~/lib/hostingCatalog";
import { getUserOrRedirect } from "~/.server/getters";
import { checkAiGenerationLimit } from "~/.server/aiGenerationLimit";
import { checkLLMTokenLimit } from "~/.server/llmTokenLimit";
import { getReferralStats } from "~/.server/core/referralOperations";
import {
  GENERATION_PACKS,
  LLM_TOKEN_PACKS,
  NEXT_PLAN,
  REFERRAL_SIGNUP_BONUS,
  REFERRAL_UPGRADE_BONUS,
  REFERRAL_WELCOME_BONUS,
  getUserPlan,
  type LlmTokenPack,
} from "~/lib/plans";
import { LlmUsageBar, formatTokens } from "~/components/LLMUsageCard";
import type { Route } from "./+types/packs";

export const meta = () => [
  { title: "Créditos y Tokens — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const plan = getUserPlan(user);
  const genLimit = await checkAiGenerationLimit(user.id, plan);
  const llmLimit = await checkLLMTokenLimit(user.id, plan);
  const referralStats = await getReferralStats(user.id);

  const nextPlan = NEXT_PLAN[plan];

  const packs = GENERATION_PACKS.map((pack) => ({
    id: pack.id,
    generations: pack.generations,
    price: pack.promoPrice ?? pack.prices[plan],
    originalPrice: pack.promoPrice ? pack.prices[plan] : null,
    promoLabel: pack.promoLabel ?? null,
    featured: pack.featured ?? false,
    description: pack.description ?? null,
    label: pack.label ?? null,
    emoji: pack.emoji ?? null,
    audience: pack.audience ?? null,
    nextPlanName: nextPlan || null,
    nextPlanPrice: nextPlan ? pack.prices[nextPlan] : null,
  }));

  return {
    packs,
    llmPacks: LLM_TOKEN_PACKS,
    plan,
    genLimit,
    llmLimit,
    referralStats,
    referralLink: `https://www.easybits.cloud/login?ref=${user.publicKey}`,
    autoTopup: user.autoTopup ?? null,
    canBuyAddon: plan !== "Byte", // box minPlan: Mega
  };
};

export default function PacksPage({ loaderData }: Route.ComponentProps) {
  const { packs, llmPacks, plan, genLimit, llmLimit, referralStats, referralLink, autoTopup, canBuyAddon } =
    loaderData;

  type Tab = "credits" | "tokens" | "sandboxes";
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(
    tabParam === "tokens" ? "tokens" : tabParam === "credits" ? "credits" : "sandboxes",
  );

  const switchTab = (t: Tab) => {
    setTab(t);
    setSearchParams(t === "sandboxes" ? {} : { tab: t }, { replace: true });
  };
  const showSuccess = searchParams.get("success") === "1";

  return (
    <section className="w-full md:pl-20 pt-14 md:pt-0">
      <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold">Créditos y Tokens</h1>
          <p className="text-iron text-sm">
            100 créditos = 1 documento profesional · Tokens para GhostyCode y el proxy LLM
          </p>
        </div>
      </div>

      {/* Stripe success toast */}
      {showSuccess && (
        <div className="mb-6 border-2 border-green-500 bg-green-50 rounded-xl p-4 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <p className="font-bold text-green-800">¡Pago exitoso!</p>
            <p className="text-sm text-green-700">
              Tus créditos o tokens ya están disponibles en tu cuenta.
            </p>
          </div>
        </div>
      )}

      {/* Auto-topup status banner */}
      <AutoTopupStatus autoTopup={autoTopup} />

      {/* Usage bars: side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <CreditUsageBar
          plan={plan}
          used={genLimit.used}
          limit={genLimit.limit}
          bonus={genLimit.bonus}
          resetAt={genLimit.resetAt ?? null}
        />
        <LlmUsageBar
          plan={plan}
          used={llmLimit.used}
          planLimit={llmLimit.planLimit}
          bonus={llmLimit.bonus}
          resetAt={llmLimit.resetAt}
        />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 border-b-2 border-black">
        <button
          onClick={() => switchTab("sandboxes")}
          className={`px-6 py-3 text-sm font-bold uppercase tracking-tight border-2 border-b-0 rounded-t-xl transition-colors ${
            tab === "sandboxes"
              ? "bg-black text-white border-black"
              : "bg-gray-100 text-iron border-gray-300 hover:bg-gray-200"
          }`}
        >
          📦 Sandboxes
        </button>
        <button
          onClick={() => switchTab("credits")}
          className={`px-6 py-3 text-sm font-bold uppercase tracking-tight border-2 border-b-0 rounded-t-xl transition-colors ${
            tab === "credits"
              ? "bg-black text-white border-black"
              : "bg-gray-100 text-iron border-gray-300 hover:bg-gray-200"
          }`}
        >
          🪄 Créditos AI
        </button>
        <button
          onClick={() => switchTab("tokens")}
          className={`px-6 py-3 text-sm font-bold uppercase tracking-tight border-2 border-b-0 rounded-t-xl transition-colors ${
            tab === "tokens"
              ? "bg-black text-white border-black"
              : "bg-gray-100 text-iron border-gray-300 hover:bg-gray-200"
          }`}
        >
          🧠 Tokens LLM
        </button>
      </div>

      {/* Pack grid */}
      {tab === "credits" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {packs.map((pack) => (
            <CreditPackCard key={pack.id} pack={pack} />
          ))}
        </div>
      ) : tab === "tokens" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {llmPacks.map((pack) => (
            <LlmPackCard key={pack.id} pack={pack} />
          ))}
        </div>
      ) : (
        <div className="mb-12">
          <p className="text-sm text-iron mb-4 max-w-xl">
            Reserva capacidad para tus agentes Ghosty. El fleetAgent es uniforme: agrega las
            cajas que necesites — cada caja corre <b>{FLEET_BOX.agents} agentes Ghosty</b> a la vez.
          </p>
          <SandboxBoxCard canBuy={canBuyAddon} />
        </div>
      )}

      {/* Referral section */}
      <ReferralSection referralLink={referralLink} stats={referralStats} />
      </div>
    </section>
  );
}

// ─── Auto-topup status ─────────────────────────────────────────────────────

function AutoTopupStatus({
  autoTopup,
}: {
  autoTopup: {
    enabled: boolean;
    packId: string;
    failedAt: Date | string | null;
    lastTopupAt: Date | string | null;
  } | null;
}) {
  // Mostrar solo si hay algo que comunicar: activa, o desactivada por fallo.
  if (!autoTopup) return null;
  const failed = !autoTopup.enabled && autoTopup.failedAt;
  if (!autoTopup.enabled && !failed) return null;

  return (
    <div
      className={`mb-6 border-2 rounded-xl p-4 flex items-center gap-3 ${
        autoTopup.enabled
          ? "border-brand-500 bg-brand-50"
          : "border-red-400 bg-red-50"
      }`}
    >
      <span className="text-2xl">{autoTopup.enabled ? "🔄" : "⚠️"}</span>
      <div className="text-sm">
        {autoTopup.enabled ? (
          <>
            <p className="font-bold">Recarga automática activa</p>
            <p className="text-iron">
              Al agotarse tu saldo, recompramos{" "}
              <strong>{autoTopup.packId}</strong> automáticamente.
              {autoTopup.lastTopupAt && (
                <>
                  {" "}Última:{" "}
                  {new Date(autoTopup.lastTopupAt).toLocaleDateString("es-MX", {
                    day: "numeric",
                    month: "short",
                  })}
                </>
              )}
            </p>
          </>
        ) : (
          <>
            <p className="font-bold text-red-700">Recarga automática desactivada</p>
            <p className="text-iron">
              No pudimos procesar el último cobro. Compra un pack con la casilla
              de recarga automática para reactivarla con una tarjeta nueva.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Credit Usage Bar ──────────────────────────────────────────────────────

function CreditUsageBar({
  plan,
  used,
  limit,
  bonus,
  resetAt,
}: {
  plan: string;
  used: number;
  limit: number | null;
  bonus: number;
  resetAt: Date | null;
}) {
  const isUnlimited = limit === null;
  const effectiveLimit = limit ?? used + bonus;
  const total = effectiveLimit + bonus;
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const remaining = Math.max(0, total - used);
  const isLow = limit !== null && used >= limit;

  return (
    <div className="border-2 border-black rounded-xl bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-base font-bold">Créditos AI</h3>
          <p className="text-xs text-iron">
            Plan {plan} · {isUnlimited ? "Ilimitado" : `${limit}/mes`}
          </p>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full border font-bold ${
            remaining > 0
              ? "border-green-400 bg-green-50 text-green-700"
              : "border-red-400 bg-red-50 text-red-700"
          }`}
        >
          {isUnlimited ? "Ilimitado" : remaining > 0 ? "Activo" : "Agotado"}
        </span>
      </div>

      <div className="flex justify-between text-xs text-iron mb-1">
        <span>{used} usados</span>
        <span>
          {isUnlimited ? "∞" : remaining} {isUnlimited ? "" : "restantes"}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden border border-gray-200">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isLow ? "bg-red-500" : pct > 60 ? "bg-yellow-500" : "bg-green-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <div className="flex items-center justify-between mt-2 text-xs flex-wrap gap-x-2">
        <span className="text-iron">
          Plan <b className="text-black">{isUnlimited ? "∞" : limit}</b> · Bonus{" "}
          <b className="text-black">{bonus}</b> · Total{" "}
          <b className="text-black">{isUnlimited ? "∞" : total}</b>
        </span>
        {resetAt && (
          <span className="text-[10px] text-iron/50">
            Renueva{" "}
            {new Date(resetAt).toLocaleDateString("es-MX", {
              day: "numeric",
              month: "short",
            })}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Credit Pack Card ───────────────────────────────────────────────────────

function CreditPackCard({
  pack,
}: {
  pack: {
    id: string;
    generations: number;
    price: number;
    originalPrice: number | null;
    promoLabel: string | null;
    featured: boolean;
    description: string | null;
    label: string | null;
    emoji: string | null;
    audience: string | null;
    nextPlanName: string | null;
    nextPlanPrice: number | null;
  };
}) {
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== "idle";
  const [autoTopup, setAutoTopup] = useState(false);

  const handleBuy = () => {
    fetcher.submit(
      { packId: pack.id, autoTopup },
      {
        method: "POST",
        action: "/api/v2/generation-packs",
        encType: "application/json",
      },
    );
  };

  if (fetcher.data?.url) {
    window.location.href = fetcher.data.url;
  }

  return (
    <div
      className={`border-2 rounded-xl bg-white hover:-translate-x-1 hover:-translate-y-1 transition-all flex flex-col relative h-full ${
        pack.featured
          ? "border-brand-500 ring-2 ring-brand-500 shadow-[4px_4px_0px_0px_#9870ED] hover:shadow-[6px_6px_0px_0px_#9870ED]"
          : "border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
      }`}
    >
      {pack.promoLabel && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 min-w-max whitespace-nowrap bg-brand-500 text-white text-xs font-bold px-3 py-1 rounded-full">
          {pack.promoLabel}
        </div>
      )}
      <div
        className={`p-6 border-b-2 text-center ${
          pack.featured ? "border-brand-500 bg-brand-50" : "border-black"
        }`}
      >
        {pack.label && (
          <p className="text-xs uppercase tracking-widest font-black text-black/70 mb-1">
            {pack.emoji && <span className="mr-1" aria-hidden>{pack.emoji}</span>}
            {pack.label}
          </p>
        )}
        <p className="text-5xl font-bold">{pack.generations}</p>
        <p className="text-iron mt-1">créditos</p>
        {pack.audience && (
          <p className="text-[11px] text-iron/70 italic mt-1.5 leading-tight">
            {pack.audience}
          </p>
        )}
      </div>
      <div className="p-6 flex flex-col flex-1 justify-between">
        <div className="text-center mb-6">
          {pack.originalPrice !== null && (
            <p className="text-lg text-iron line-through">${pack.originalPrice} mxn</p>
          )}
          <p className={`text-3xl font-bold ${pack.featured ? "text-brand-500" : ""}`}>
            ${pack.price}{" "}
            <span className="text-base text-iron font-normal">mxn</span>
          </p>
          {pack.nextPlanName && pack.nextPlanPrice !== null && pack.nextPlanPrice < pack.price && (
            <p className="text-xs text-iron mt-1">
              En {pack.nextPlanName}: ${pack.nextPlanPrice} mxn
            </p>
          )}
          {pack.description && (
            <p className="text-xs text-iron mt-2">{pack.description}</p>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-iron mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoTopup}
            onChange={(e) => setAutoTopup(e.target.checked)}
            className="rounded border-2 border-black"
          />
          🔄 Recargar automáticamente al agotarse
        </label>
        <BrutalButton
          onClick={handleBuy}
          isLoading={isLoading}
          className={`w-full ${pack.featured ? "bg-brand-500 text-white" : "bg-white"}`}
          containerClassName="w-full"
        >
          Comprar
        </BrutalButton>
      </div>
    </div>
  );
}

// ─── Sandbox Box Card (caja del fleetAgent: agrega N cajas iguales) ───────────────

function SandboxBoxCard({ canBuy }: { canBuy: boolean }) {
  const fetcher = useFetcher<{ url?: string; error?: string }>();
  const isLoading = fetcher.state !== "idle";
  const [qty, setQty] = useState(1);

  const ramGB = FLEET_BOX.memoryMb / 1024;
  const diskGB = Math.round(FLEET_BOX.diskMb / 1024);
  const totalAgents = FLEET_BOX.agents * qty;
  const totalPrice = FLEET_BOX.priceMxn * qty;
  const shownBoxes = Math.min(qty, 12); // cap mini-box render; overflow shown as "+N"

  if (fetcher.data?.url) {
    window.location.href = fetcher.data.url;
  }

  return (
    <div className="border-2 border-brand-500 ring-2 ring-brand-500 rounded-xl bg-white shadow-[4px_4px_0px_0px_#9870ED] grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] overflow-hidden">
      {/* Left: fleetAgent grows with quantity — clusters of 4 keep "4 por caja" legible */}
      <div className="p-6 bg-brand-50 flex flex-col items-center justify-center text-center lg:border-r-2 border-brand-500 border-b-2 lg:border-b-0">
        <p className="text-[11px] uppercase tracking-widest font-black text-black/70 mb-3">
          {qty === 1 ? "Caja del fleetAgent" : `${qty} cajas del fleetAgent`}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 mb-3 max-w-[20rem]">
          {Array.from({ length: shownBoxes }).map((_, b) => (
            <div key={b} className="grid grid-cols-2 gap-1 p-1.5 rounded-lg border border-brand-300/70 bg-white/60">
              {Array.from({ length: FLEET_BOX.agents }).map((_, i) => (
                <img key={i} src="/logo-purple.svg" alt="" className="w-5 h-5" />
              ))}
            </div>
          ))}
          {qty > shownBoxes && (
            <span className="text-xs font-bold text-brand-500 px-1">+{qty - shownBoxes}</span>
          )}
        </div>
        <p className="text-xl font-bold leading-tight">{totalAgents} agentes Ghosty</p>
        <p className="mt-0.5 text-xs font-black uppercase tracking-wide text-brand-500">
          {qty} {qty === 1 ? "caja" : "cajas"} × {FLEET_BOX.agents}
        </p>
        <div className="flex items-center justify-center gap-3 text-xs text-iron mt-3 flex-wrap">
          <span className="flex items-center gap-1" title="RAM total reservada"><LuMemoryStick size={13} /> {ramGB * qty}GB</span>
          <span className="flex items-center gap-1" title="vCPU compartida por caja"><LuCpu size={13} /> {FLEET_BOX.vcpus} vCPU/caja</span>
          <span className="flex items-center gap-1" title="Disco total reservado"><LuHardDrive size={13} /> {diskGB * qty}GB</span>
        </div>
        <p className="text-[10px] text-iron/60 mt-1">RAM y disco en total · CPU compartida</p>
      </div>

      {/* Middle: multiplier */}
      <div className="px-8 py-6 flex flex-col items-center justify-center gap-3 border-b-2 lg:border-b-0 lg:border-r-2 border-brand-500">
        <span className="text-xs font-black uppercase tracking-widest text-iron">¿Cuántas cajas?</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1}
            className="w-11 h-11 border-2 border-black rounded-lg font-bold text-2xl leading-none hover:bg-gray-100 disabled:opacity-30"
            aria-label="Quitar caja"
          >
            −
          </button>
          <span className="w-16 text-center text-4xl font-bold tabular-nums">{qty}</span>
          <button
            onClick={() => setQty((q) => Math.min(50, q + 1))}
            disabled={qty >= 50}
            className="w-11 h-11 border-2 border-black rounded-lg font-bold text-2xl leading-none hover:bg-gray-100 disabled:opacity-30"
            aria-label="Agregar caja"
          >
            +
          </button>
        </div>
        <p className="text-xs text-iron">× ${FLEET_BOX.priceMxn} mxn c/u</p>
      </div>

      {/* Right: total + buy */}
      <div className="p-6 flex flex-col items-center justify-center gap-3 text-center">
        <div>
          <p className="text-sm text-iron">{totalAgents} agentes Ghosty simultáneos</p>
          <p className="text-4xl font-bold text-brand-500">
            ${totalPrice.toLocaleString("es-MX")}{" "}
            <span className="text-lg text-iron font-normal">mxn/mes</span>
          </p>
        </div>
        {fetcher.data?.error && (
          <p className="text-xs text-red-600">{fetcher.data.error}</p>
        )}
        <BrutalButton
          onClick={() =>
            fetcher.submit(
              { quantity: qty },
              { method: "POST", action: "/api/v2/sandbox-reservations", encType: "application/json" },
            )
          }
          isLoading={isLoading}
          isDisabled={!canBuy}
          className="w-full bg-brand-500 text-white"
          containerClassName="w-full max-w-xs"
        >
          {canBuy ? `Comprar ${qty} ${qty === 1 ? "caja" : "cajas"}` : "Desde Mega"}
        </BrutalButton>
        {!canBuy && (
          <a
            href="/planes"
            className="text-xs font-semibold text-brand-500 hover:underline"
          >
            Mejora a Mega para comprar cajas ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ─── LLM Token Pack Card ────────────────────────────────────────────────────

function LlmPackCard({ pack }: { pack: LlmTokenPack }) {
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== "idle";
  const [autoTopup, setAutoTopup] = useState(false);

  const handleBuy = () => {
    fetcher.submit(
      { packId: pack.id, packType: "tokens", autoTopup },
      {
        method: "POST",
        action: "/api/v2/generation-packs",
        encType: "application/json",
      },
    );
  };

  if (fetcher.data?.url) {
    window.location.href = fetcher.data.url;
  }

  const tokensM = pack.tokens / 1_000_000;

  return (
    <div
      className={`border-2 rounded-xl bg-white hover:-translate-x-1 hover:-translate-y-1 transition-all flex flex-col relative h-full ${
        pack.featured
          ? "border-brand-500 ring-2 ring-brand-500 shadow-[4px_4px_0px_0px_#9870ED] hover:shadow-[6px_6px_0px_0px_#9870ED]"
          : "border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
      }`}
    >
      {pack.featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 min-w-max whitespace-nowrap bg-brand-500 text-white text-xs font-bold px-3 py-1 rounded-full">
          Más popular
        </div>
      )}
      <div
        className={`p-6 border-b-2 text-center ${
          pack.featured ? "border-brand-500 bg-brand-50" : "border-black"
        }`}
      >
        <p className="text-xs uppercase tracking-widest font-black text-black/70 mb-1">
          🧠 Tokens LLM
        </p>
        <p className="text-5xl font-bold">{tokensM}M</p>
        <p className="text-iron mt-1">tokens</p>
      </div>
      <div className="p-6 flex flex-col flex-1 justify-between">
        <div className="text-center mb-6">
          <p className="text-3xl font-bold">
            ${pack.price.toLocaleString("es-MX")}{" "}
            <span className="text-base text-iron font-normal">mxn</span>
          </p>
          <p className="text-xs text-iron mt-2">
            ≈ ${(pack.price / tokensM).toFixed(0)} MXN / 1M tokens
          </p>
          {pack.description && (
            <p className="text-xs text-iron mt-2">{pack.description}</p>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-iron mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoTopup}
            onChange={(e) => setAutoTopup(e.target.checked)}
            className="rounded border-2 border-black"
          />
          🔄 Recargar automáticamente al agotarse
        </label>
        <BrutalButton
          onClick={handleBuy}
          isLoading={isLoading}
          className={`w-full ${pack.featured ? "bg-brand-500 text-white" : "bg-white"}`}
          containerClassName="w-full"
        >
          Comprar
        </BrutalButton>
      </div>
    </div>
  );
}

// ─── Referral Section ───────────────────────────────────────────────────────

function ReferralSection({
  referralLink,
  stats,
}: {
  referralLink: string;
  stats: {
    count: number;
    totalBonus: number;
    referrals: {
      id: string;
      displayName: string | null;
      picture: string | null;
      status: string;
      bonusAwarded: number;
      createdAt: string;
    }[];
  };
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-2 border-black rounded-xl bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-6">
      <h2 className="text-2xl font-bold mb-2">
        🎁 Invita amigos, gana créditos gratis
      </h2>
      <p className="text-sm text-iron mb-4">Comparte tu link y ambos ganan créditos AI</p>

      {/* Referral link */}
      <div className="flex items-center gap-2 mb-6">
        <div className="flex-1 border-2 border-black rounded-lg px-3 py-2 bg-gray-50 text-sm truncate font-mono">
          {referralLink}
        </div>
        <BrutalButton
          onClick={handleCopy}
          className={copied ? "bg-emerald-400 border-emerald-600" : undefined}
          containerClassName={copied ? "bg-emerald-600" : undefined}
        >
          {copied ? "✓ Copiado!" : "Copiar"}
        </BrutalButton>
      </div>

      {/* Reward cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-brand-50 border-2 border-brand-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-brand-500">+{REFERRAL_SIGNUP_BONUS}</p>
          <p className="text-sm font-medium mt-1">Se registra</p>
          <p className="text-xs text-iron mt-0.5">Tu amigo crea cuenta</p>
        </div>
        <div className="bg-brand-50 border-2 border-brand-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-brand-500">+{REFERRAL_UPGRADE_BONUS}</p>
          <p className="text-sm font-medium mt-1">Upgrade a pago</p>
          <p className="text-xs text-iron mt-0.5">Si elige plan Mega o Tera</p>
        </div>
        <div className="bg-brand-50 border-2 border-brand-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-brand-500">+{REFERRAL_WELCOME_BONUS}</p>
          <p className="text-sm font-medium mt-1">Tu amigo recibe</p>
          <p className="text-xs text-iron mt-0.5">Bonus de bienvenida</p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-6 mb-6 text-sm">
        <div>
          <span className="text-iron">Referidos:</span>{" "}
          <span className="font-bold">{stats.count}</span>
        </div>
        <div>
          <span className="text-iron">Bonus otorgado (total):</span>{" "}
          <span className="font-bold text-brand-500">{stats.totalBonus}</span>
        </div>
      </div>

      {/* Referral list */}
      {stats.referrals.length > 0 && (
        <div className="space-y-2">
          {stats.referrals.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 py-2 border-t border-gray-200"
            >
              {r.picture ? (
                <img
                  src={r.picture}
                  alt=""
                  className="w-8 h-8 rounded-full border border-gray-300"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold">
                  {(r.displayName || "?")[0]}
                </div>
              )}
              <span className="font-medium flex-1">
                {r.displayName || "Usuario"}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full border ${
                  r.status === "UPGRADED"
                    ? "bg-green-50 text-green-700 border-green-300"
                    : "bg-gray-50 text-gray-600 border-gray-300"
                }`}
              >
                {r.status === "UPGRADED" ? "Plan pago" : "Registrado"}
              </span>
              <span className="text-sm font-bold text-brand-500">
                +{r.bonusAwarded}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
