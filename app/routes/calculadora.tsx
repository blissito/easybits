import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AuthNav } from "~/components/login/auth-nav";
import { Footer } from "~/components/common/Footer";
import { BrutalButton } from "~/components/common/BrutalButton";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { formatMxn } from "~/lib/quiz/pricing";
import { effectivePrice, PLANS, type PlanKey } from "~/lib/plans";
import { HOSTING_CATALOG, SELLABLE_TIERS, type TierKey } from "~/lib/hostingCatalog";
import {
  computeRunCost,
  DEFAULT_CALC,
  parseCalc,
  serializeCalc,
  WEB_FREE_QUERIES,
  type CalcInputs,
} from "~/lib/calculadora";
import type { Route } from "./+types/calculadora";

export const clientLoader = async () => {
  const user = await fetch("/api/v1/user?intent=self").then((r) => r.json()).catch(() => null);
  return { user };
};

export const meta = () => [
  ...getBasicMetaTags({
    title: "¿Cuánto cuesta correr mi agente? — Calculadora | EasyBits",
    description:
      "Calcula en MXN lo que cuesta operar tu agente en EasyBits: plan, cajas, consultas web, créditos, tokens y hosting. Sin setup, empiezas gratis.",
    url: "https://www.easybits.cloud/calculadora",
  }),
  { tagName: "link", rel: "canonical", href: "https://www.easybits.cloud/calculadora" },
];

// Sliders numéricos: rango y paso pensados para que el recorrido visual cubra
// del hobby (izquierda) a producción (derecha) sin escala no lineal.
type SliderDef = { key: keyof Omit<CalcInputs, "plan" | "hosting">; emoji: string; label: string; unit: string; max: number; step: number; hint: string };
const SLIDERS: SliderDef[] = [
  { key: "agents", emoji: "🤖", label: "Agentes a la vez", unit: "agentes", max: 40, step: 1, hint: "Conversaciones o tareas corriendo al mismo tiempo. Cada caja corre 4." },
  { key: "webQueries", emoji: "🌐", label: "Consultas web / mes", unit: "consultas", max: 50000, step: 50, hint: `Buscar, leer o extraer registros. ${WEB_FREE_QUERIES} gratis al mes.` },
  { key: "docs", emoji: "📄", label: "Documentos / mes", unit: "docs", max: 500, step: 1, hint: "PDF, landings, presentaciones. 100 créditos cada uno." },
  { key: "images", emoji: "🖼", label: "Imágenes / mes", unit: "imgs", max: 1000, step: 5, hint: "Generadas o editadas. 50 créditos cada una." },
  { key: "reels", emoji: "🎬", label: "Reels / mes", unit: "reels", max: 300, step: 1, hint: "Video HTML animado. 100 créditos cada uno." },
  { key: "voiceMinutes", emoji: "🎙", label: "Minutos de voz / mes", unit: "min", max: 120, step: 1, hint: "Síntesis de voz. 800 créditos por minuto." },
  { key: "llmMillions", emoji: "🧠", label: "Tokens LLM / mes", unit: "M tokens", max: 200, step: 1, hint: "Por el proxy OpenAI-compatible. Byte trae 5M una vez; Mega 10M y Tera 50M al mes." },
  { key: "storageGb", emoji: "💾", label: "Storage", unit: "GB", max: 200, step: 1, hint: "Archivos guardados. Byte 0.1 GB · Mega 10 GB · Tera 100 GB." },
];

const PLAN_BG: Record<PlanKey, string> = { Byte: "bg-blue-200", Mega: "bg-brand-yellow", Tera: "bg-brand-pink" };

export default function CalculadoraRoute({ loaderData }: Route.ComponentProps) {
  const user = loaderData?.user ?? null;
  const [params, setParams] = useSearchParams();
  const [inputs, setInputs] = useState<CalcInputs>(() => parseCalc(params));
  const [hydrated, setHydrated] = useState(false);

  // Hidratar UNA vez desde la URL (links compartidos) y después escribirla.
  useEffect(() => {
    if (!hydrated) { setInputs(parseCalc(params)); setHydrated(true); return; }
    setParams(serializeCalc(inputs), { replace: true, preventScrollReset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, hydrated]);

  const result = useMemo(() => computeRunCost(inputs), [inputs]);
  const set = <K extends keyof CalcInputs>(k: K, v: CalcInputs[K]) => setInputs((prev) => ({ ...prev, [k]: v }));

  return (
    <section className="min-h-screen bg-brand-grass flex flex-col">
      <AuthNav user={user} />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-8 pt-24 md:pt-36 pb-20">
        <p className="text-xs md:text-sm uppercase tracking-[0.2em] font-bold text-black/70 mb-3">Calculadora · para expertos</p>
        <h1 className="text-4xl md:text-6xl font-black text-black leading-[0.95] mb-4">¿Cuánto cuesta correr mi agente?</h1>
        <p className="text-lg md:text-xl text-black/80 mb-10 max-w-2xl">
          Lo que ves es lo que se cobra: plan plano + packs que no caducan. Sin setup, sin mensualidad obligatoria — el plan Byte es gratis.
        </p>

        <div className="grid lg:grid-cols-[3fr_2fr] gap-8 items-start">
          {/* ── Entradas ── */}
          <div className="rounded-3xl border-[3px] border-black bg-white p-6 md:p-8 shadow-[6px_6px_0_0_rgba(0,0,0,1)]">
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-black/55 mb-2">Plan</p>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {(Object.keys(PLANS) as PlanKey[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set("plan", k)}
                  className={`rounded-xl border-2 border-black px-3 py-2 text-left transition-transform ${inputs.plan === k ? `${PLAN_BG[k]} -translate-y-0.5 shadow-[3px_3px_0_0_rgba(0,0,0,1)]` : "bg-white hover:bg-gray-50"}`}
                >
                  <span className="block text-sm font-black uppercase">{k}</span>
                  <span className="block text-xs font-mono text-black/70">{effectivePrice(k) === 0 ? "gratis" : `${formatMxn(effectivePrice(k))}/mes`}</span>
                </button>
              ))}
            </div>
            {result.suggestedPlan !== inputs.plan && (
              <p className="text-xs font-mono text-black/60 -mt-3 mb-5">
                Con este uso te conviene <button type="button" className="underline font-bold" onClick={() => set("plan", result.suggestedPlan)}>{result.suggestedPlan}</button>.
              </p>
            )}

            <div className="flex flex-col gap-5">
              {SLIDERS.map((s) => {
                const value = inputs[s.key];
                return (
                  <div key={s.key}>
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <label htmlFor={`c-${s.key}`} className="text-sm font-black text-black flex items-center gap-2">
                        <span aria-hidden>{s.emoji}</span>{s.label}
                      </label>
                      <span className="text-sm font-mono tabular-nums">{value.toLocaleString("es-MX")} {s.unit}</span>
                    </div>
                    <input
                      id={`c-${s.key}`}
                      type="range"
                      min={0}
                      max={s.max}
                      step={s.step}
                      value={value}
                      onChange={(e) => set(s.key, Number(e.target.value))}
                      className="w-full h-2 accent-black cursor-pointer"
                    />
                    <p className="text-[11px] text-black/55 mt-1">{s.hint}</p>
                  </div>
                );
              })}
            </div>

            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-black/55 mt-8 mb-2">Apps hospedadas</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {SELLABLE_TIERS.map((k) => {
                const t = HOSTING_CATALOG[k as TierKey];
                const n = inputs.hosting[k as TierKey] ?? 0;
                return (
                  <div key={k} className="flex items-center justify-between rounded-xl border-2 border-black px-3 py-2">
                    <div>
                      <span className="block text-sm font-black">{k}</span>
                      <span className="block text-[11px] font-mono text-black/60">{t.vcpus} vCPU · {t.memoryMb / 1024} GB · {formatMxn(t.priceShared)}/mes</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      <button type="button" aria-label="menos" className="w-7 h-7 rounded-full border-2 border-black" onClick={() => set("hosting", { ...inputs.hosting, [k]: Math.max(0, n - 1) })}>−</button>
                      <span className="w-5 text-center tabular-nums">{n}</span>
                      <button type="button" aria-label="más" className="w-7 h-7 rounded-full border-2 border-black" onClick={() => set("hosting", { ...inputs.hosting, [k]: n + 1 })}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Total ── */}
          <aside className="lg:sticky lg:top-28">
            <div className="rounded-2xl border-[3px] border-black bg-black text-white p-6 shadow-[5px_5px_0_0_rgba(0,0,0,1)]">
              <p className="text-[10px] uppercase tracking-[0.2em] font-black text-brand-yellow">Total estimado</p>
              <p className="text-5xl font-black tabular-nums leading-tight mt-1">
                {formatMxn(result.monthlyMxn)}<span className="text-lg font-normal text-white/60"> /mes</span>
              </p>
              <ul className="mt-5 flex flex-col gap-2 text-sm">
                {result.lines.map((l) => (
                  <li key={l.key} className="flex justify-between gap-3 border-b border-white/10 pb-2">
                    <span><span className="font-bold">{l.label}</span><span className="block text-[11px] font-mono text-white/55">{l.detail}</span></span>
                    <span className="font-mono tabular-nums shrink-0">{formatMxn(l.mxn)}</span>
                  </li>
                ))}
              </ul>
              {result.notes.map((n) => (
                <p key={n} className="mt-3 text-[12px] text-brand-yellow">⚠ {n}</p>
              ))}
              <p className="mt-4 text-[11px] text-white/55">Los packs no caducan: si un mes usas menos, te sobran para el siguiente. Precios en MXN, IVA incluido.</p>
              <div className="mt-6 flex flex-col gap-3">
                <Link to="/login"><BrutalButton className="w-full">Empezar gratis →</BrutalButton></Link>
                <Link to="/cuanto-cuesta-mi-agente" className="text-center text-sm underline underline-offset-4 text-white/80 hover:text-white">
                  ¿Prefieres que lo hagamos por ti?
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </section>
  );
}
