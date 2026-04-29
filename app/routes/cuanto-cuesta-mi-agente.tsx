import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { AuthNav } from "~/components/login/auth-nav";
import { BrutalButton } from "~/components/common/BrutalButton";
import { QuizStep, StepIndicator } from "~/components/quiz/QuizStep";
import { CapabilityCard } from "~/components/quiz/CapabilityCard";
import { PriceSummary } from "~/components/quiz/PriceSummary";
import { LeadForm, type LeadData } from "~/components/quiz/LeadForm";
import { WebsiteEnrich } from "~/components/quiz/WebsiteEnrich";
import {
  IntegrationsStep,
  type IntegrationsAnswer,
} from "~/components/quiz/IntegrationsStep";
import { HeroIllustration } from "~/components/quiz/illustrations/HeroIllustration";
import { CAPABILITIES, DEFAULT_TIER_ID } from "~/lib/quiz/capabilities";
import {
  computeQuote,
  formatMxn,
  formatUsd,
  parseSelections,
  serializeSelections,
  type Selections,
} from "~/lib/quiz/pricing";
import { playReveal } from "~/lib/quiz/sounds";
import { useBrutalToast } from "~/hooks/useBrutalToast";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import type { Route } from "./+types/cuanto-cuesta-mi-agente";

const WHATSAPP_NUMBER = "527757609276";
const QUIZ_FORM_ID = "69efd203ad74435521a74b34";

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

const CAP_COUNT = CAPABILITIES.length;
// Steps: 0=hero, 1..N=caps, N+1=integrations, N+2=lead, N+3=summary
const STEP_INTEGRATIONS = CAP_COUNT + 1;
const STEP_LEAD = CAP_COUNT + 2;
const STEP_SUMMARY = CAP_COUNT + 3;
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

  const quote = useMemo(
    () => computeQuote(selections, integrations.hasIntegrations),
    [selections, integrations.hasIntegrations]
  );

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
      if (QUIZ_FORM_ID) {
        const res = await fetch(`/api/v2/forms/${QUIZ_FORM_ID}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            selections: serializeSelections(selections),
            integrations: integrations.hasIntegrations
              ? integrations.description || "yes (sin descripción)"
              : "no",
            monthly_mxn: String(quote.monthlyTotalMxn),
            setup_usd: String(quote.setupOneTimeUsd),
          }),
        });
        if (!res.ok) throw new Error(`form submit failed: ${res.status}`);
      }
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
          monthlyTotalMxn: quote.monthlyTotalMxn,
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
    const businessLine = lead?.business ? `\nNegocio: ${lead.business}` : "";
    const siteLine = lead?.website ? `\nSitio: ${lead.website}` : "";
    const setupLine = `Setup único: ${formatMxn(quote.setupOneTimeMxn)} MXN (≈ ${formatUsd(quote.setupOneTimeUsd)} USD)`;
    const monthlyLine = `Mensualidad: ${formatMxn(quote.monthlyTotalMxn)} MXN/mes (lista, antes del 20% off)`;
    const msg = `${greeting} Vi tu cotizador y quiero agendar discovery para mi agente IA.\n\n${setupLine}\n${monthlyLine}\n\nCapacidades:\n${summary}${integrationsLine}${businessLine}${siteLine}`;
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
  const isLeadStep = step === STEP_LEAD;
  const isSummaryStep = step === STEP_SUMMARY;

  // Hydrate state from URL (?s=voice:pro,images,whatsapp&i=1) on first mount.
  useEffect(() => {
    if (hydrated) return;
    const sParam = searchParams.get("s");
    if (sParam) {
      const parsed = parseSelections(sParam);
      if (parsed.size > 0) {
        setSelections(parsed);
        if (searchParams.get("i") === "1") {
          setIntegrations((prev) => ({ ...prev, hasIntegrations: true }));
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
    }
    // preventScrollReset evita que React Router brinque al top al editar
    // selecciones desde el summary (quitar/agregar capacidades).
    setSearchParams(next, { replace: true, preventScrollReset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, isSummaryStep, selections, integrations.hasIntegrations]);

  // Confetti + reveal sound when the summary first appears
  const [celebratedSummary, setCelebratedSummary] = useState(false);
  useEffect(() => {
    if (!isSummaryStep || celebratedSummary) return;
    setCelebratedSummary(true);
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
        {!isHero && (
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
                      Configúralo en 2 minutos. Te decimos cuánto es el setup
                      único y la mensualidad. Discovery call gratis al final.
                    </motion.p>
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.3 }}
                    >
                      <BrutalButton onClick={() => setStep(1)}>
                        Configurar mi agente →
                      </BrutalButton>
                    </motion.div>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="text-sm text-black/60 mt-6 font-mono"
                    >
                      {CAP_COUNT} capacidades · setup único $8K USD ·
                      mensualidad MXN
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
                  capability={CAPABILITIES[step - 1]}
                  onAnswer={(tierId) =>
                    handleAnswer(CAPABILITIES[step - 1].id, tierId)
                  }
                />
                {/* Always render to avoid layout shift; invisible until first selection */}
                <p
                  aria-hidden={selections.size === 0}
                  className={`text-center text-sm font-mono mt-6 tabular-nums transition-opacity duration-200 ${
                    selections.size === 0
                      ? "opacity-0 select-none"
                      : "opacity-100 text-black/60"
                  }`}
                >
                  acumulado: {formatMxn(quote.monthlyTotalMxn)} / mes
                </p>
              </QuizStep>
            )}

            {isIntegrationsStep && (
              <QuizStep stepKey="integrations">
                <IntegrationsStep onAnswer={handleIntegrations} />
                <p className="text-center text-sm font-mono text-black/60 mt-6 tabular-nums">
                  acumulado: {formatMxn(quote.monthlyTotalMxn)} / mes
                </p>
              </QuizStep>
            )}

            {isLeadStep && (
              <QuizStep stepKey="lead">
                <div className="mb-6">
                  <p className="text-center text-sm font-mono text-black/60 tabular-nums">
                    Estimación parcial: {formatMxn(quote.monthlyTotalMxn)} / mes
                  </p>
                </div>
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
                  customIntegrationsDescription={
                    integrations.hasIntegrations
                      ? integrations.description
                      : undefined
                  }
                  onDownloadPdf={handleDownloadPdf}
                  isDownloadingPdf={downloadingPdf}
                  disableDownload={submitting}
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
                  onRemoveCustomIntegrations={() =>
                    setIntegrations({
                      hasIntegrations: false,
                      items: [],
                      description: "",
                    })
                  }
                  siteAnalysisCaptured={!!lead?.website}
                />

                <div className="mt-8 flex flex-col md:flex-row gap-4 justify-center items-center">
                  <BrutalButton
                    onClick={handleWhatsApp}
                    isDisabled={submitting || downloadingPdf}
                  >
                    Agendar discovery por WhatsApp →
                  </BrutalButton>
                  <BrutalButton
                    mode="ghost"
                    onClick={handleCheckout}
                    isLoading={submitting}
                    isDisabled={downloadingPdf}
                  >
                    Pagar mensualidad (setup aparte)
                  </BrutalButton>
                </div>
                <div className="mt-4 flex flex-col md:flex-row gap-2 md:gap-6 justify-center items-center">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="text-sm font-bold text-black/70 hover:text-black underline-offset-4 hover:underline py-2 px-3"
                  >
                    📋 Copiar link de esta cotización
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-sm font-bold text-black/70 hover:text-black underline-offset-4 hover:underline py-2 px-3"
                  >
                    ↻ Reiniciar cotización
                  </button>
                </div>
                {submitError && (
                  <p className="text-center text-red-600 mt-4 font-bold">
                    {submitError}
                  </p>
                )}
                {lead && !lead.website && (
                  <WebsiteEnrich
                    email={lead.email}
                    formId={QUIZ_FORM_ID}
                    onEnriched={(website) =>
                      setLead((prev) => (prev ? { ...prev, website } : prev))
                    }
                  />
                )}
                <div className="mt-8 mx-auto max-w-md rounded-xl border-[2.5px] border-black bg-white px-5 py-4 shadow-[3px_3px_0_0_rgba(0,0,0,1)]">
                  <p className="text-[10px] uppercase tracking-[0.2em] font-black text-black/60 mb-1.5">
                    ✦ Por qué somos directos
                  </p>
                  <p className="text-sm text-black leading-snug">
                    Somos un equipo pequeño. Nos comprometemos con cada cliente
                    y los tomamos muy en serio — por eso atendemos pocos a la
                    vez, sin diluir la atención.
                  </p>
                </div>
                <p className="text-center text-xs text-black/50 mt-6 font-mono">
                  Discovery call de 45 min gratis · Setup ($8K USD) se cobra
                  tras la llamada · Mensualidad arranca día 31 del setup
                </p>
              </QuizStep>
            )}
          </AnimatePresence>
        </div>
      </main>
    </section>
  );
}
