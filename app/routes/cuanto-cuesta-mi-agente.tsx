import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AuthNav } from "~/components/login/auth-nav";
import { Footer } from "~/components/common/Footer";
import { BrutalButton } from "~/components/common/BrutalButton";
import { QuizStep, StepIndicator } from "~/components/quiz/QuizStep";
import { CapabilityCard } from "~/components/quiz/CapabilityCard";
import { PriceSummary } from "~/components/quiz/PriceSummary";
import { LeadForm, type LeadData } from "~/components/quiz/LeadForm";
import { HeroIllustration } from "~/components/quiz/illustrations/HeroIllustration";
import { CAPABILITIES } from "~/lib/quiz/capabilities";
import { computeQuote, formatMxn } from "~/lib/quiz/pricing";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import type { Route } from "./+types/cuanto-cuesta-mi-agente";

const WHATSAPP_NUMBER = "527712412825";
const QUIZ_FORM_ID = "69efaea1fa87b78d893a311e";

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
    title: "¿Cuánto cuesta mi agente AI? | EasyBits",
    description:
      "Configura tu agente AI personalizado en 2 minutos. Voz, WhatsApp, imágenes, memoria, video y más. Cotización al instante.",
  });

const CAP_COUNT = CAPABILITIES.length;
const TOTAL_STEPS = CAP_COUNT + 3; // hero + N caps + lead + summary

export default function QuizAgenteRoute({ loaderData }: Route.ComponentProps) {
  const user = loaderData?.user ?? null;
  const [step, setStep] = useState(0); // 0=hero, 1..N=caps, N+1=lead, N+2=summary
  const [selections, setSelections] = useState<Set<string>>(new Set());
  const [lead, setLead] = useState<LeadData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const quote = useMemo(
    () => computeQuote(Array.from(selections)),
    [selections]
  );

  const handleAnswer = (capId: string, include: boolean) => {
    setSelections((prev) => {
      const next = new Set(prev);
      if (include) next.add(capId);
      else next.delete(capId);
      return next;
    });
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
            selections: JSON.stringify(Array.from(selections)),
            total_mxn: String(quote.totalMxn),
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
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/v2/quiz-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selections: Array.from(selections),
          totalMxn: quote.totalMxn,
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
    if (!lead) return;
    const summary = quote.breakdown
      .map((b) => `• ${b.capability.shortLabel}`)
      .join("\n");
    const msg = `Hola, soy ${lead.name}. Hice el quiz de EasyBits y mi cotización fue ${formatMxn(quote.totalMxn)}/mes con:\n${summary}\n\nNegocio: ${lead.business || "—"}\nSitio: ${lead.website || "—"}\nQuiero hablar antes de pagar.`;
    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`,
      "_blank"
    );
  };

  const isHero = step === 0;
  const isCapStep = step >= 1 && step <= CAP_COUNT;
  const isLeadStep = step === CAP_COUNT + 1;
  const isSummaryStep = step === CAP_COUNT + 2;

  return (
    <section className="min-h-screen bg-brand-grass flex flex-col">
      <AuthNav user={user} />
      <main className="flex-1 flex flex-col px-4 md:px-8 py-8 md:py-12 max-w-5xl mx-auto w-full">
        {!isHero && (
          <div className="mb-8 flex justify-between items-center gap-4">
            <StepIndicator current={step} total={TOTAL_STEPS - 1} />
            {!isSummaryStep && step > 1 && (
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="text-sm font-bold text-black/60 hover:text-black underline-offset-4 hover:underline"
              >
                ← atrás
              </button>
            )}
          </div>
        )}

        <div className="flex-1 flex flex-col justify-center min-h-[560px] md:min-h-[640px]">
        <AnimatePresence mode="wait">
          {isHero && (
            <QuizStep stepKey="hero">
              <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center py-8 md:py-16">
                <div className="text-left order-2 md:order-1">
                  <motion.h1
                    initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: 0.6 }}
                    className="text-5xl md:text-6xl lg:text-7xl font-black text-black leading-[0.95] mb-6"
                  >
                    ¿Qué puede hacer un agente AI por tu negocio?
                  </motion.h1>
                  <motion.p
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.15 }}
                    className="text-lg md:text-xl text-black/80 mb-8"
                  >
                    Configúralo en 2 minutos. Te decimos exactamente cuánto
                    cuesta y empezamos esta semana.
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
                    {CAP_COUNT} capacidades · pago mensual MXN · cancela
                    cuando quieras
                  </motion.p>
                </div>
                <div className="order-1 md:order-2 max-w-md md:max-w-none mx-auto w-full">
                  <HeroIllustration />
                </div>
              </div>
            </QuizStep>
          )}

          {isCapStep && (
            <QuizStep stepKey={`cap-${step}`}>
              <CapabilityCard
                capability={CAPABILITIES[step - 1]}
                onAnswer={(include) =>
                  handleAnswer(CAPABILITIES[step - 1].id, include)
                }
              />
              {selections.size > 0 && (
                <p className="text-center text-sm font-mono text-black/60 mt-6">
                  acumulado: {formatMxn(quote.totalMxn)} / mes
                </p>
              )}
            </QuizStep>
          )}

          {isLeadStep && (
            <QuizStep stepKey="lead">
              <div className="mb-6">
                <p className="text-center text-sm font-mono text-black/60">
                  Estimación parcial: {formatMxn(quote.totalMxn)} / mes
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
              <PriceSummary quote={quote} />
              <div className="mt-10 flex flex-col md:flex-row gap-4 justify-center items-center">
                <BrutalButton
                  onClick={handleCheckout}
                  isLoading={submitting}
                >
                  Pagar y empezar →
                </BrutalButton>
                <BrutalButton mode="ghost" onClick={handleWhatsApp}>
                  Hablar antes por WhatsApp
                </BrutalButton>
              </div>
              {submitError && (
                <p className="text-center text-red-600 mt-4 font-bold">
                  {submitError}
                </p>
              )}
              <p className="text-center text-xs text-black/50 mt-6 font-mono">
                Después del pago te contactamos en 24h para terminar el setup
                de WhatsApp y APIs.
              </p>
            </QuizStep>
          )}
        </AnimatePresence>
        </div>
      </main>
      <Footer />
    </section>
  );
}
