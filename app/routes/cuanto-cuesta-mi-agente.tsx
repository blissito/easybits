import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { AuthNav } from "~/components/login/auth-nav";
import { BrutalButton } from "~/components/common/BrutalButton";
import { QuizStep, StepIndicator } from "~/components/quiz/QuizStep";
import { CapabilityCard } from "~/components/quiz/CapabilityCard";
import { PriceSummary, type PlanBilling } from "~/components/quiz/PriceSummary";
import type { PlanKey } from "~/lib/plans";
import { LeadForm, type LeadData } from "~/components/quiz/LeadForm";
import {
  IntegrationsStep,
  type IntegrationsAnswer,
} from "~/components/quiz/IntegrationsStep";
import {
  ConfiguradorStep,
  computeTotalCredits,
  DEFAULT_CONSUMPTION,
  type ConsumptionConfig,
} from "~/components/quiz/ConfiguradorStep";
import { computePlanFromCredits } from "~/lib/credits";
import { HeroIllustration } from "~/components/quiz/illustrations/HeroIllustration";
import { CAPABILITIES, DEFAULT_TIER_ID } from "~/lib/quiz/capabilities";
import { QUIZ_WHATSAPP_NUMBER } from "~/lib/quiz/contact";
import {
  computeQuote,
  computeSetupEffective,
  formatMxn,
  parseSelections,
  serializeSelections,
  type Selections,
} from "~/lib/quiz/pricing";
import { PLANS } from "~/lib/plans";
import { playReveal } from "~/lib/quiz/sounds";
import { useBrutalToast } from "~/hooks/useBrutalToast";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import type { Route } from "./+types/cuanto-cuesta-mi-agente";

const WHATSAPP_NUMBER = QUIZ_WHATSAPP_NUMBER;

export const clientLoader = async () => {
  try {
    const user = await fetch("/api/v1/user?intent=self").then((r) => r.json());
    return { user };
  } catch {
    return { user: null };
  }
};

export const meta = () =>
  getBasicMetaTags({
    title: "¿Cuánto cuesta mi agente IA? | EasyBits",
    description:
      "Configura tu agente IA personalizado en 2 minutos. Voz, WhatsApp, imágenes, memoria, video, cotizaciones y más. Cotización al instante.",
    image:
      "https://easybits-public.fly.storage.tigris.dev/699f35cbc8ad86037eda62b1/wPv1V-",
    url: "https://www.easybits.cloud/cuanto-cuesta-mi-agente",
  });

// Solo capabilities seleccionables van al stepper. Las marcadas `comingSoon`
// aparecen sólo como signaling en la pill list del summary.
const STEPPER_CAPABILITIES = CAPABILITIES.filter((c) => !c.comingSoon);
const CAP_COUNT = STEPPER_CAPABILITIES.length;
// Steps: 0=hero, 1..N=caps, N+1=integrations, N+2=plan, N+3=lead, N+4=summary
const STEP_INTEGRATIONS = CAP_COUNT + 1;
const STEP_PLAN = CAP_COUNT + 2;
const STEP_LEAD = CAP_COUNT + 3;
const STEP_SUMMARY = CAP_COUNT + 4;
const TOTAL_PROGRESS_STEPS = STEP_SUMMARY; // displayed total (excludes hero)

export default function QuizAgenteRoute({ loaderData }: Route.ComponentProps) {
  const user = loaderData?.user ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const showToast = useBrutalToast();
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<Selections>(new Map());
  const [integrations, setIntegrations] = useState<IntegrationsAnswer>({
    hasIntegrations: false,
    items: [],
    description: "",
  });
  const [lead, setLead] = useState<LeadData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // Configuración de consumo del agente — sliders del ConfiguradorStep.
  // El plan (Byte/Mega/Tera) y el precio se DERIVAN de aquí.
  const [consumption, setConsumption] = useState<ConsumptionConfig>(
    DEFAULT_CONSUMPTION
  );
  // Mensual vs anual del plan. Solo aplica cuando hay precio mensual > 0.
  const [planBilling, setPlanBilling] = useState<PlanBilling>("monthly");
  // Babysit ahora vive como capability `babysit` en `selections` — es un paso
  // del stepper como cualquier otra. Derivado para los payloads.
  const babysitOpt = selections.has("babysit");

  // Derived: total cr/mes y plan/precio según los sliders.
  const totalCredits = useMemo(
    () => computeTotalCredits(consumption),
    [consumption]
  );
  const planQuote = useMemo(
    () => computePlanFromCredits(totalCredits),
    [totalCredits]
  );
  const selectedPlan = planQuote.plan;

  const quote = useMemo(
    () => computeQuote(selections, integrations.hasIntegrations),
    [selections, integrations.hasIntegrations]
  );

  // Billing efectivo: forzar monthly si el plan es gratis (no aplica anual).
  // Antes el switch era por nombre del plan (Byte=gratis), ahora Byte puede
  // ser pago si el slider lo empuja cerca de Mega — chequeamos el quote.
  const effectivePlanBilling: PlanBilling = planQuote.isFree
    ? "monthly"
    : planBilling;

  // tierId === null → no incluir; cualquier string → incluir con ese tier.
  const handleAnswer = (capId: string, tierId: string | null) => {
    setSelections((prev) => {
      const next = new Map(prev);
      if (tierId) next.set(capId, tierId);
      else next.delete(capId);
      return next;
    });
    setStep((s) => s + 1);
  };

  const handleIntegrations = (answer: IntegrationsAnswer) => {
    setIntegrations(answer);
    setStep((s) => s + 1);
  };

  const handleLeadSubmit = async (data: LeadData) => {
    setSubmitting(true);
    setSubmitError(null);
    setLead(data);
    try {
      // Endpoint dedicado: guarda el lead Y manda la cotización por email
      // con PDF adjunto. Si el email falla no bloqueamos al usuario — el
      // lead queda guardado y puede descargar manualmente desde el summary.
      const res = await fetch("/api/v2/quiz-lead-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          selections: serializeSelections(selections),
          integrations: integrations.hasIntegrations
            ? integrations.description || "yes (sin descripción)"
            : "no",
          monthly_mxn: String(planQuote.priceMxn),
          setup_mxn: String(
            computeSetupEffective(
              quote.capsTotalMxn,
              integrations.hasIntegrations
            )
          ),
          plan: selectedPlan,
          planBilling: effectivePlanBilling,
          babysit: babysitOpt,
          customIntegrations: integrations.hasIntegrations
            ? {
                description: integrations.description,
                items: integrations.items,
              }
            : null,
        }),
      });
      if (!res.ok) throw new Error(`lead submit failed: ${res.status}`);
      setStep((s) => s + 1);
    } catch (err) {
      setSubmitError("No pudimos guardar tus datos. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckout = async () => {
    if (!lead) {
      setStep(STEP_LEAD);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/v2/quiz-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selections: serializeSelections(selections),
          plan: selectedPlan,
          planBilling: effectivePlanBilling,
          babysit: babysitOpt,
          customIntegrations: integrations.hasIntegrations
            ? {
                description: integrations.description,
                items: integrations.items,
              }
            : null,
          lead,
        }),
      });
      if (!res.ok) throw new Error("checkout failed");
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setSubmitError(
        "No pudimos crear el checkout. Escríbenos por WhatsApp y te ayudamos."
      );
      setSubmitting(false);
    }
  };

  const handleWhatsApp = () => {
    const summary = quote.breakdown
      .map((b) => `• ${b.capability.shortLabel}`)
      .join("\n");
    const integrationsLine = integrations.hasIntegrations
      ? integrations.items.length > 0
        ? `\nIntegraciones custom:\n${integrations.items.map((it) => `  - ${it}`).join("\n")}`
        : `\nIntegraciones custom: sí (a definir)`
      : "";
    const greeting = lead
      ? `Hola, soy ${lead.name}.`
      : "Hola, vi tu landing.";
    const siteLine = lead?.website ? `\nSitio: ${lead.website}` : "";
    const setupEff = computeSetupEffective(
      quote.capsTotalMxn,
      integrations.hasIntegrations
    );
    const setupLine = `Setup único: ${formatMxn(setupEff)} MXN`;
    const planLine = `Plan créditos: ${selectedPlan} (${totalCredits.toLocaleString("es-MX")} cr/mes configurados${
      planQuote.priceMxn > 0
        ? ` · ${formatMxn(planQuote.priceMxn)} MXN/mes${effectivePlanBilling === "annual" ? " · facturado anual" : ""}`
        : " · gratis"
    })`;
    // Babysit ahora vive como capability en el summary, no necesita línea aparte.
    const msg = `${greeting} Vi tu cotizador y quiero agendar discovery para mi agente IA.\n\n${setupLine}\n${planLine}\n\nCapacidades:\n${summary}${integrationsLine}${siteLine}`;
    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`,
      "_blank"
    );
  };

  const handleDownloadPdf = async () => {
    if (!lead) {
      setStep(STEP_LEAD);
      return;
    }
    setDownloadingPdf(true);
    setSubmitError(null);
    // Abort si el fetch se queda colgado (HMR, red lenta, edge case server).
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch("/api/v2/quiz-cotizacion-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          selections: serializeSelections(selections),
          plan: selectedPlan,
          planBilling: effectivePlanBilling,
          babysit: babysitOpt,
          customIntegrations: integrations.hasIntegrations
            ? {
                description: integrations.description,
                items: integrations.items,
              }
            : null,
          lead,
        }),
      });
      if (!res.ok) throw new Error(`pdf failed: ${res.status}`);
      const blob = await res.blob();
      const folio = res.headers.get("X-Quiz-Folio") || "cotizacion";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `EasyBits-Cotizacion-${folio}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      setSubmitError(
        aborted
          ? "El PDF tardó demasiado. Recarga la página y vuelve a intentar."
          : "No pudimos generar tu PDF. Pídelo por WhatsApp y te lo mandamos."
      );
    } finally {
      clearTimeout(timeoutId);
      setDownloadingPdf(false);
    }
  };

  const handleReset = () => {
    setSelections(new Map());
    setIntegrations({ hasIntegrations: false, items: [], description: "" });
    setLead(null);
    setSubmitError(null);
    setCelebratedSummary(false);
    setSearchParams({}, { replace: true });
    setStep(0);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Link copiado — ya puedes compartir tu cotización");
    } catch {
      setSubmitError("No pudimos copiar el link. Cópialo manualmente desde la barra del navegador.");
    }
  };

  const isHero = step === 0;
  const isCapStep = step >= 1 && step <= CAP_COUNT;
  const isIntegrationsStep = step === STEP_INTEGRATIONS;
  const isPlanStep = step === STEP_PLAN;
  const isLeadStep = step === STEP_LEAD;
  const isSummaryStep = step === STEP_SUMMARY;

  // Stripe redirect flags. `paidFlag` y `cancelledFlag` se setean en quiz-checkout
  // success_url/cancel_url. Render dedicado para que el usuario no caiga
  // en el cotizador vacío después de pagar miles de pesos.
  const paidFlag = searchParams.get("paid") === "1";
  const cancelledFlag = searchParams.get("cancelled") === "1";
  const checkoutSessionId = searchParams.get("session_id") || "";
  const showCheckoutResult = paidFlag || cancelledFlag;

  // Hydrate state from URL (?s=voice:pro,images,whatsapp&i=1&ii=hubspot&b=annual) on first mount.
  useEffect(() => {
    if (hydrated) return;
    const sParam = searchParams.get("s");
    if (sParam) {
      const parsed = parseSelections(sParam);
      if (parsed.size > 0) {
        // Compat: links viejos llevan ?bs=1 — mapeamos a la capability babysit.
        if (searchParams.get("bs") === "1" && !parsed.has("babysit")) {
          parsed.set("babysit", DEFAULT_TIER_ID);
        }
        setSelections(parsed);
        if (searchParams.get("i") === "1") {
          const itemsParam = searchParams.get("ii") || "";
          const items = itemsParam
            .split(",")
            .map((s) => decodeURIComponent(s).trim())
            .filter(Boolean);
          setIntegrations({
            hasIntegrations: true,
            items,
            description: items.join(" · "),
          });
        }
        // Plan ya no es seleccionable directo — se deriva de los sliders
        // del ConfiguradorStep. El param `p=` queda como compat de links
        // viejos: lo ignoramos para no forzar un plan que no coincida con
        // el consumo actual del usuario.
        if (searchParams.get("pb") === "annual") {
          setPlanBilling("annual");
        }
        setStep(STEP_SUMMARY);
      }
    }
    setHydrated(true);
  }, [hydrated, searchParams]);

  // Sync URL when state changes while user is on the summary view.
  useEffect(() => {
    if (!hydrated || !isSummaryStep) return;
    const next = new URLSearchParams();
    if (selections.size > 0) {
      next.set("s", serializeSelections(selections));
    }
    if (integrations.hasIntegrations) {
      next.set("i", "1");
      if (integrations.items.length > 0) {
        next.set(
          "ii",
          integrations.items.map((it) => encodeURIComponent(it)).join(",")
        );
      }
    }
    next.set("p", selectedPlan);
    if (effectivePlanBilling === "annual") {
      next.set("pb", "annual");
    }
    // preventScrollReset evita que React Router brinque al top al editar
    // selecciones desde el summary (quitar/agregar capacidades).
    setSearchParams(next, { replace: true, preventScrollReset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hydrated,
    isSummaryStep,
    selections,
    integrations.hasIntegrations,
    integrations.items,
    selectedPlan,
    effectivePlanBilling,
  ]);

  // Confetti + reveal sound when the summary first appears
  const [celebratedSummary, setCelebratedSummary] = useState(false);
  useEffect(() => {
    if (!isSummaryStep || celebratedSummary) return;
    setCelebratedSummary(true);
    // Reset scroll al top antes del confetti — el usuario llega del lead step
    // con el viewport en una posición arbitraria y se perdería el momento "wow"
    // y las métricas/CTAs del summary. Respeta prefers-reduced-motion porque
    // `behavior: "smooth"` ignora esa preferencia.
    if (typeof window !== "undefined") {
      const prefersReduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      window.scrollTo({
        top: 0,
        behavior: prefersReduced ? "auto" : "smooth",
      });
    }
    playReveal();
    import("js-confetti")
      .then(({ default: JSConfetti }) => {
        const confetti = new JSConfetti();
        confetti.addConfetti({
          confettiColors: [
            "#ECD66E",
            "#FFAFA3",
            "#C8F9AB",
            "#9870ED",
            "#75BAF9",
            "#F4B7EC",
            "#FFFFFF",
          ],
          confettiNumber: 240,
        });
      })
      .catch(() => {});
  }, [isSummaryStep, celebratedSummary]);

  return (
    <section className="min-h-screen bg-brand-grass flex flex-col pb-[env(safe-area-inset-bottom)]">
      <AuthNav user={user} />
      <main className="flex-1 flex flex-col px-8 md:px-20 lg:px-32 py-24 md:py-40 max-w-5xl mx-auto w-full">
        {showCheckoutResult && (
          <div className="flex-1 flex items-center justify-center">
            <div className="max-w-xl mx-auto w-full">
              {paidFlag ? (
                <div className="rounded-3xl border-[3px] border-black bg-white p-8 md:p-10 shadow-[6px_6px_0_0_rgba(0,0,0,1)] text-center">
                  <div className="text-5xl mb-4" aria-hidden>
                    🎉
                  </div>
                  <h1 className="text-3xl md:text-4xl font-black text-black mb-3 leading-tight">
                    ¡Pago confirmado!
                  </h1>
                  <p className="text-base md:text-lg text-black/75 mb-6 leading-snug">
                    Te contactamos por WhatsApp en{" "}
                    <strong>menos de 24h hábiles</strong> para arrancar el
                    acompañamiento y configurar tu agente. Si pagaste fuera
                    de horario (9-18h MX), respondemos al siguiente día hábil.
                  </p>
                  <div className="bg-brand-yellow border-2 border-black rounded-xl px-5 py-4 mb-6 text-left">
                    <p className="text-[10px] uppercase tracking-[0.2em] font-black text-black/70 mb-2">
                      Próximos pasos
                    </p>
                    <ol className="text-sm text-black/80 space-y-1.5 leading-snug list-decimal list-inside">
                      <li>Te llega email de confirmación con tu factura.</li>
                      <li>
                        Te escribimos al WhatsApp que dejaste para iniciar
                        discovery.
                      </li>
                      <li>
                        En 24h tu agente arranca, con acompañamiento por
                        WhatsApp los primeros 30 días.
                      </li>
                    </ol>
                  </div>
                  <BrutalButton
                    onClick={() => {
                      const msg = `Hola, acabo de pagar el setup ${checkoutSessionId ? `(sesión ${checkoutSessionId.slice(-8)})` : ""}. Listo para arrancar.`;
                      window.open(
                        `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`,
                        "_blank"
                      );
                    }}
                    containerClassName="h-16 md:h-20"
                    className="h-16 md:h-20 px-8 md:px-12 text-xl md:text-2xl"
                  >
                    Avisarles por WhatsApp →
                  </BrutalButton>
                  <p className="text-xs text-black/50 mt-4 font-mono">
                    Si no recibes respuesta en 24h, escríbenos directo al
                    WhatsApp.
                  </p>
                </div>
              ) : (
                <div className="rounded-3xl border-[3px] border-black bg-white p-8 md:p-10 shadow-[6px_6px_0_0_rgba(0,0,0,1)] text-center">
                  <div className="text-5xl mb-4" aria-hidden>
                    🛑
                  </div>
                  <h1 className="text-3xl md:text-4xl font-black text-black mb-3 leading-tight">
                    Pago cancelado — sin cargos
                  </h1>
                  <p className="text-base md:text-lg text-black/75 mb-6 leading-snug">
                    No te cobramos nada. Si tuviste dudas o algo no se vio
                    bien, hablemos por WhatsApp antes de pagar — preferimos
                    cerrar el deal hablando.
                  </p>
                  <div className="flex flex-col md:flex-row gap-3 justify-center">
                    <BrutalButton
                      onClick={() => {
                        const msg = `Hola, intenté pagar pero cancelé. ¿Podemos hablar antes?`;
                        window.open(
                          `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`,
                          "_blank"
                        );
                      }}
                      containerClassName="h-16 md:h-20"
                      className="h-16 md:h-20 px-8 md:px-12 text-xl md:text-2xl"
                    >
                      Hablar por WhatsApp
                    </BrutalButton>
                    <BrutalButton
                      mode="ghost"
                      onClick={() => {
                        setSearchParams({}, { replace: true });
                      }}
                      containerClassName="h-16 md:h-20"
                      className="h-16 md:h-20 px-8 md:px-12 text-xl md:text-2xl"
                    >
                      Volver al cotizador
                    </BrutalButton>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {!showCheckoutResult && !isHero && (
          <div className="mb-6 relative flex justify-center items-center">
            <StepIndicator current={step} total={TOTAL_PROGRESS_STEPS} />
            {!isSummaryStep && step > 1 && (
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-sm font-bold text-black/60 hover:text-black underline-offset-4 hover:underline py-2 px-3"
              >
                ← atrás
              </button>
            )}
          </div>
        )}

        {/* Stable canvas — content pinned to top so layout doesn't shift */}
        {!showCheckoutResult && (
        <div className="flex-1 flex flex-col items-stretch min-h-[calc(100svh-220px)] md:min-h-[760px]">
          <AnimatePresence mode="wait">
            {isHero && (
              <QuizStep stepKey="hero">
                <div className="grid md:grid-cols-[3fr_2fr] gap-8 md:gap-12 items-center py-4 md:py-8">
                  <div className="text-left order-2 md:order-1">
                    <motion.p
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6 }}
                      className="text-xs md:text-sm uppercase tracking-[0.2em] font-bold text-black/70 mb-4"
                    >
                      Guía interactiva de agentes IA
                    </motion.p>
                    <motion.h1
                      initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{ duration: 0.6, delay: 0.1 }}
                      className="text-4xl md:text-5xl lg:text-6xl font-black text-black leading-[0.95] mb-6"
                    >
                      Arma tu agente tú mism@
                    </motion.h1>
                    <motion.p
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.15 }}
                      className="text-lg md:text-xl text-black/80 mb-8"
                    >
                      Entérate en 2 minutos. Sabrás en cuánto queda tu pago de
                      personalización y tu mensualidad. Tú decides lo que tu
                      agente podrá hacer. 🫟
                    </motion.p>
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.3 }}
                    >
                      <BrutalButton
                        onClick={() => setStep(1)}
                        containerClassName="h-16 md:h-20"
                        className="h-16 md:h-20 px-8 md:px-12 text-xl md:text-2xl"
                      >
                        Configurar mi agente →
                      </BrutalButton>
                    </motion.div>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="text-sm text-black/85 mt-6 font-mono font-bold"
                    >
                      Setup único desde $39,000 MXN (~$2,300 USD)
                      <br />
                      planes accesibles · te armamos todo
                    </motion.p>
                  </div>
                  <div className="order-1 md:order-2 max-w-[260px] md:max-w-none mx-auto w-full">
                    <HeroIllustration />
                  </div>
                </div>
              </QuizStep>
            )}

            {isCapStep && (
              <QuizStep stepKey={`cap-${step}`}>
                <CapabilityCard
                  capability={STEPPER_CAPABILITIES[step - 1]}
                  onAnswer={(tierId) =>
                    handleAnswer(STEPPER_CAPABILITIES[step - 1].id, tierId)
                  }
                />
              </QuizStep>
            )}

            {isIntegrationsStep && (
              <QuizStep stepKey="integrations">
                <IntegrationsStep onAnswer={handleIntegrations} />
              </QuizStep>
            )}

            {isPlanStep && (
              <QuizStep stepKey="plan">
                <ConfiguradorStep
                  consumption={consumption}
                  onChange={setConsumption}
                  onContinue={() => {
                    // Si el lead ya se capturó antes (caso "ajustar consumo"
                    // desde el summary), saltamos el lead form y vamos
                    // directo al summary — no le pedimos los datos otra vez.
                    setStep(lead ? STEP_SUMMARY : STEP_LEAD);
                  }}
                />
              </QuizStep>
            )}

            {isLeadStep && (
              <QuizStep stepKey="lead">
                <LeadForm onSubmit={handleLeadSubmit} isLoading={submitting} />
                {submitError && (
                  <p className="text-center text-red-600 mt-4 font-bold">
                    {submitError}
                  </p>
                )}
              </QuizStep>
            )}

            {isSummaryStep && (
              <QuizStep stepKey="summary">
                <PriceSummary
                  quote={quote}
                  selectedPlan={selectedPlan}
                  planMonthlyMxn={planQuote.priceMxn}
                  planCreditsPerMonth={totalCredits}
                  planOverageCredits={planQuote.overageCredits}
                  planBilling={effectivePlanBilling}
                  onPlanBillingChange={setPlanBilling}
                  onChangePlan={() => setStep(STEP_PLAN)}
                  onCheckout={handleCheckout}
                  isCheckoutLoading={submitting}
                  isCheckoutDisabled={downloadingPdf}
                  availableToAdd={CAPABILITIES.filter(
                    (c) => !selections.has(c.id)
                  )}
                  onAddCapability={(id) =>
                    setSelections((prev) => {
                      const next = new Map(prev);
                      // Si tiene tiers, default al primero ("basic"). Si no, DEFAULT_TIER_ID.
                      const cap = CAPABILITIES.find((c) => c.id === id);
                      const tierId =
                        cap?.tiers && cap.tiers.length > 0
                          ? cap.tiers[0].id
                          : DEFAULT_TIER_ID;
                      next.set(id, tierId);
                      return next;
                    })
                  }
                  onRemoveCapability={(id) =>
                    setSelections((prev) => {
                      const next = new Map(prev);
                      next.delete(id);
                      return next;
                    })
                  }
                />

                {/* Acciones secundarias primero (compartir, reset, PDF) — el
                    usuario las explora antes de comprometerse. Los CTAs
                    primarios (pagar / WhatsApp) viven al final del stack. */}
                <div className="mt-8 flex flex-wrap gap-x-4 gap-y-2 justify-center items-center text-xs">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="text-black/65 hover:text-black underline underline-offset-2 font-mono"
                  >
                    📋 Compartir mi cotización
                  </button>
                  <span className="text-black/30" aria-hidden>·</span>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-black/65 hover:text-black underline underline-offset-2 font-mono"
                  >
                    ↻ Reset
                  </button>
                </div>
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={downloadingPdf || submitting}
                    className="inline-flex items-center gap-2 text-sm text-black/70 hover:text-black underline underline-offset-4 decoration-black/30 hover:decoration-black disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                  >
                    {downloadingPdf ? (
                      <>
                        <span className="inline-block w-3.5 h-3.5 border-2 border-black/60 border-t-transparent rounded-full animate-spin" />
                        <span>Generando cotización…</span>
                      </>
                    ) : (
                      "↓ Descargar cotización (PDF)"
                    )}
                  </button>
                </div>
                {submitError && (
                  <p className="text-center text-red-600 mt-4 font-bold">
                    {submitError}
                  </p>
                )}
                <div className="mt-8 mx-auto max-w-xl w-full flex justify-center items-center">
                  <BrutalButton
                    mode="ghost"
                    onClick={handleWhatsApp}
                    isDisabled={submitting || downloadingPdf}
                    containerClassName="h-16 md:h-20"
                    className="h-16 md:h-20 px-8 md:px-12 text-xl md:text-2xl"
                  >
                    Hablar con Brenda primero (whatsapp)
                  </BrutalButton>
                </div>
                <div className="mt-8 mx-auto max-w-lg">
                  <p className="text-[10px] uppercase tracking-[0.2em] font-black text-black/60 mb-2 text-center">
                    Cómo arrancamos
                  </p>
                  <ol className="text-sm text-black/75 space-y-1.5 leading-snug list-decimal list-inside">
                    <li>
                      <strong className="text-black">
                        Hablamos primero por WhatsApp
                      </strong>
                      : validamos que encajamos antes de cobrar. Si no, no hay
                      deal.
                    </li>
                    <li>
                      <strong className="text-black">
                        Pagas setup + primer mes
                      </strong>{" "}
                      en un solo cargo (Stripe). Cargo único + suscripción
                      mensual quedan armados. Si hablamos, seguro ya tienes
                      un cupón de descuento. 🎟️
                    </li>
                    <li>
                      <strong className="text-black">
                        Arrancamos en 24h
                      </strong>{" "}
                      con acompañamiento por WhatsApp los primeros 30 días — ventana 9-18h MX.
                    </li>
                    <li>
                      <strong className="text-black">
                        Mensualidad sigue automática
                      </strong>{" "}
                      — cancelas cuando quieras (el setup no se reembolsa una
                      vez iniciado el armado).
                    </li>
                  </ol>
                </div>
              </QuizStep>
            )}
          </AnimatePresence>
        </div>
        )}
      </main>
    </section>
  );
}
