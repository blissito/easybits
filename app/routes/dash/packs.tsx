import { useState } from "react";
import { useFetcher } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getUserOrRedirect } from "~/.server/getters";
import { checkAiGenerationLimit } from "~/.server/aiGenerationLimit";
import { getReferralStats } from "~/.server/core/referralOperations";
import { GENERATION_PACKS, NEXT_PLAN, REFERRAL_SIGNUP_BONUS, REFERRAL_UPGRADE_BONUS, REFERRAL_WELCOME_BONUS, getUserPlan } from "~/lib/plans";
import type { Route } from "./+types/packs";

export const meta = () => [
  { title: "Packs de Generaciones — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const plan = getUserPlan(user);
  const genLimit = await checkAiGenerationLimit(user.id, plan);
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
    nextPlanName: nextPlan || null,
    nextPlanPrice: nextPlan ? pack.prices[nextPlan] : null,
  }));

  return {
    packs,
    plan,
    ...genLimit,
    referralStats,
    referralLink: `https://www.easybits.cloud/login?ref=${user.publicKey}`,
  };
};

export default function PacksPage({ loaderData }: Route.ComponentProps) {
  const { packs, plan, used, limit, bonus, referralStats, referralLink } =
    loaderData;

  return (
    <section className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Generaciones AI</h1>
      <p className="text-iron mb-8">
        Compra packs de generaciones extra. No expiran ni se resetean
        mensualmente.
      </p>

      {/* Current usage */}
      <div className="border-2 border-black rounded-xl p-4 mb-8 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm text-iron">Plan actual</p>
            <p className="text-xl font-bold">{plan}</p>
          </div>
          <div>
            <p className="text-sm text-iron">Usadas este mes</p>
            <p className={`text-xl font-bold ${limit !== null && used >= limit ? "text-red-500" : ""}`}>
              {used} / {limit === null ? "∞" : limit}
            </p>
          </div>
          <div>
            <p className="text-sm text-iron">Bonus disponible</p>
            <p className="text-xl font-bold text-brand-500">{bonus}</p>
          </div>
        </div>
      </div>

      {/* Pack cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
        {packs.map((pack) => (
          <PackCard key={pack.id} pack={pack} />
        ))}
      </div>

      {/* Referral section */}
      <ReferralSection
        referralLink={referralLink}
        stats={referralStats}
      />
    </section>
  );
}

function PackCard({
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
    nextPlanName: string | null;
    nextPlanPrice: number | null;
  };
}) {
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== "idle";

  const handleBuy = () => {
    fetcher.submit(
      { packId: pack.id },
      {
        method: "POST",
        action: "/api/v2/generation-packs",
        encType: "application/json",
      }
    );
  };

  // Redirect to Stripe when URL comes back
  if (fetcher.data?.url) {
    window.location.href = fetcher.data.url;
  }

  return (
    <div className={`border-2 rounded-xl bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-1 hover:-translate-y-1 transition-all flex flex-col relative ${pack.featured ? "border-brand-500 ring-2 ring-brand-500" : "border-black"}`}>
      {pack.promoLabel && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 min-w-max whitespace-nowrap bg-brand-500 text-white text-xs font-bold px-3 py-1 rounded-full">
          {pack.promoLabel}
        </div>
      )}
      <div className={`p-6 border-b-2 text-center ${pack.featured ? "border-brand-500 bg-brand-50" : "border-black"}`}>
        <p className="text-5xl font-bold">{pack.generations}</p>
        <p className="text-iron mt-1">generaciones</p>
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
        <BrutalButton
          onClick={handleBuy}
          isLoading={isLoading}
          className={`w-full ${pack.featured ? "bg-brand-500" : "bg-brand-500"}`}
          containerClassName="w-full"
        >
          Comprar
        </BrutalButton>
      </div>
    </div>
  );
}

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
        🎁 Invita amigos, gana generaciones gratis
      </h2>
      <p className="text-sm text-iron mb-4">Comparte tu link y ambos ganan generaciones AI</p>

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
