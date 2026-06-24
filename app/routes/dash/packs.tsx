import { useState } from "react";
import { useFetcher, useSearchParams, data } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { LuMemoryStick, LuCpu, LuHardDrive } from "react-icons/lu";
import { HOSTING_CATALOG, TIER_ORDER } from "~/lib/hostingCatalog";
import { createPermanent } from "~/.server/core/machineOperations";
import type { AuthContext } from "~/.server/apiAuth";
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

  // Sandboxes reservados (always-on) = add-ons equivalentes a máquinas permanentes.
  // 3 tiers que mapean a las clases de agente (Texto/Navegador/Estudio).
  const CURATED: Record<string, { clase: string; desc: string; legend: string; featured?: boolean }> = {
    nano: { clase: "Texto", desc: "Atención y respuestas", legend: "Nunca se calla. 💬" },
    lite: { clase: "Navegador", desc: "Chromium para ver/capturar webs", legend: "Chismea webs por ti. 🕵️", featured: true },
    plus: { clase: "Estudio", desc: "Multimedia pesado (video/imágenes)", legend: "Suda pixeles, no tú. 🎬" },
  };
  const agentsFor = (mb: number) => Math.max(2, Math.round(mb / 410)); // densidad estimada claude-worker
  const sandboxTiers = TIER_ORDER.map((key) => {
    const t = HOSTING_CATALOG[key];
    const c = CURATED[key];
    return {
      key, curated: !!c, featured: c?.featured ?? false,
      clase: c?.clase ?? key.toUpperCase(),
      desc: c?.desc ?? `${t.vcpus} vCPU · ${Math.round(t.diskMb / 1024)}GB`,
      legend: c?.legend ?? "",
      memoryMb: t.memoryMb, vcpus: t.vcpus, diskMb: t.diskMb,
      price: t.priceShared, agents: agentsFor(t.memoryMb),
    };
  });

  return {
    packs,
    llmPacks: LLM_TOKEN_PACKS,
    plan,
    genLimit,
    llmLimit,
    referralStats,
    referralLink: `https://www.easybits.cloud/login?ref=${user.publicKey}`,
    autoTopup: user.autoTopup ?? null,
    sandboxTiers,
    canBuyAddon: plan !== "Byte", // tiers minPlan: Mega
  };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const fd = await request.formData();
  if (String(fd.get("intent")) !== "buy-sandbox") {
    return data({ error: "intent inválido" }, { status: 400 });
  }
  const ctx = { user, scopes: ["ADMIN"] } as AuthContext;
  try {
    const m = await createPermanent(ctx, { tier: String(fd.get("tier")) });
    return data({ ok: true, sandboxId: m.sandboxId });
  } catch (e) {
    return data({ error: e instanceof Error ? e.message : "No se pudo crear el sandbox" }, { status: 400 });
  }
};

export default function PacksPage({ loaderData }: Route.ComponentProps) {
  const { packs, llmPacks, plan, genLimit, llmLimit, referralStats, referralLink, autoTopup, sandboxTiers, canBuyAddon } =
    loaderData;

  type Tab = "credits" | "tokens" | "sandboxes";
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(
    tabParam === "tokens" ? "tokens" : tabParam === "sandboxes" ? "sandboxes" : "credits",
  );

  const switchTab = (t: Tab) => {
    setTab(t);
    setSearchParams(t === "credits" ? {} : { tab: t }, { replace: true });
  };
  const [showAllTiers, setShowAllTiers] = useState(true);
  const shownTiers = showAllTiers ? sandboxTiers : sandboxTiers.filter((t) => t.curated);

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
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <p className="text-sm text-iron">
              Reserva capacidad dedicada para tus agentes. Elige el tamaño según lo que harán —
              cada sandbox corre varios agentes a la vez.
            </p>
            <button onClick={() => setShowAllTiers((v) => !v)}
              className="shrink-0 text-xs font-bold border-2 border-black rounded-lg px-3 py-1.5 hover:bg-gray-100">
              {showAllTiers ? "← Ver 3 clases" : "Ver las 10 tiers →"}
            </button>
          </div>
          <div className={`grid gap-4 ${showAllTiers ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-1 sm:grid-cols-3"}`}>
            {shownTiers.map((t) => (
              <SandboxAddonCard key={t.key} tier={t} canBuy={canBuyAddon} />
            ))}
          </div>
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

// ─── Sandbox Add-on Card (máquina permanente / always-on) ───────────────────

function SandboxAddonCard({
  tier,
  canBuy,
}: {
  tier: { key: string; clase: string; desc: string; featured: boolean; curated: boolean; memoryMb: number; vcpus: number; diskMb: number; price: number; agents: number; legend: string };
  canBuy: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const isLoading = fetcher.state !== "idle";
  const ramGB = tier.memoryMb / 1024;
  const ramLabel = ramGB < 1 ? `${tier.memoryMb}MB` : `${ramGB}GB`;
  const diskGB = Math.round(tier.diskMb / 1024);
  const shown = Math.min(tier.agents, 10); // cap visual; el texto muestra el real
  const rows = shown <= 5 ? 1 : 2;
  const cols = Math.ceil(shown / rows); // filas balanceadas: 6→3+3, 10→5+5

  return (
    <div
      className={`border-2 rounded-xl bg-white hover:-translate-x-1 hover:-translate-y-1 transition-all flex flex-col relative h-full ${
        tier.featured
          ? "border-brand-500 ring-2 ring-brand-500 shadow-[4px_4px_0px_0px_#9870ED] hover:shadow-[6px_6px_0px_0px_#9870ED]"
          : "border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
      }`}
    >
      <div className={`p-4 border-b-2 text-center ${tier.featured ? "border-brand-500 bg-brand-50" : "border-black"}`}>
        <p className="text-[11px] uppercase tracking-widest font-black text-black/70 mb-2">{tier.clase}</p>
        <div className="flex items-center justify-center min-h-[3.25rem] mb-2">
          <div className="grid gap-1 justify-center" style={{ gridTemplateColumns: `repeat(${cols}, auto)` }}>
            {Array.from({ length: shown }).map((_, i) => (
              <img key={i} src="/logo-purple.svg" alt="" className="w-6 h-6" />
            ))}
          </div>
        </div>
        <p className="text-lg font-bold leading-tight">{tier.agents} agentes</p>
        <p className="mt-0.5 text-xs font-black uppercase tracking-wide text-brand-500">simultáneos</p>
        <div className="flex items-center justify-center gap-2 text-[11px] text-iron mt-2 flex-wrap">
          <span className="flex items-center gap-0.5" title="RAM"><LuMemoryStick size={12} /> {ramLabel}</span>
          <span className="flex items-center gap-0.5" title="CPU"><LuCpu size={12} /> {tier.vcpus} vCPU</span>
          <span className="flex items-center gap-0.5" title="Disco"><LuHardDrive size={12} /> {diskGB}GB</span>
        </div>
        {tier.curated && <p className="text-[11px] text-iron/70 italic mt-1.5 leading-tight">{tier.desc}</p>}
      </div>
      <div className="p-4 flex flex-col flex-1 justify-between">
        <div className="text-center mb-4">
          <p className={`text-2xl font-bold ${tier.featured ? "text-brand-500" : ""}`}>
            ${tier.price} <span className="text-sm text-iron font-normal">mxn/mes</span>
          </p>
          {tier.legend && <p className="text-xs text-iron mt-1.5">{tier.legend}</p>}
        </div>
        {fetcher.data && "ok" in fetcher.data ? (
          <p className="text-sm text-center text-green-700 font-bold">✅ Sandbox encendido — verlo en <a href="/dash/hosting" className="underline">Hosting</a></p>
        ) : (
          <>
            {fetcher.data && "error" in fetcher.data && <p className="text-xs text-red-600 mb-2 text-center">{fetcher.data.error}</p>}
            <BrutalButton
              onClick={() => fetcher.submit({ intent: "buy-sandbox", tier: tier.key }, { method: "POST" })}
              isLoading={isLoading}
              isDisabled={!canBuy}
              className={`w-full ${tier.featured ? "bg-brand-500 text-white" : "bg-white"}`}
              containerClassName="w-full"
            >
              {canBuy ? "Comprar" : "Desde Mega"}
            </BrutalButton>
          </>
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
