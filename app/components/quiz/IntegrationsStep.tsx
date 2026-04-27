import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Input } from "~/components/common/Input";
import { BrutalButton } from "~/components/common/BrutalButton";
import { CUSTOM_INTEGRATIONS_MXN } from "~/lib/quiz/capabilities";
import { formatMxn } from "~/lib/quiz/pricing";

export type IntegrationsAnswer = {
  hasIntegrations: boolean;
  description: string;
};

type IntegrationsStepProps = {
  onAnswer: (answer: IntegrationsAnswer) => void;
};

export const IntegrationsStep = ({ onAnswer }: IntegrationsStepProps) => {
  const [opted, setOpted] = useState<boolean | null>(null);
  const [description, setDescription] = useState("");

  const handleSubmit = () => {
    if (opted === null) return;
    onAnswer({
      hasIntegrations: opted,
      description: opted ? description.trim() : "",
    });
  };

  return (
    <div className="flex flex-col items-center gap-6 max-w-2xl mx-auto w-full">
      <motion.div
        initial={{ scale: 0.92, rotate: -2 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 16 }}
        className="rounded-3xl border-[3px] border-black px-6 py-8 md:px-10 md:py-10 w-full bg-white shadow-[6px_6px_0_0_rgba(0,0,0,1)] min-h-[440px] flex flex-col"
      >
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl" aria-hidden>
            🔌
          </span>
          <span className="text-xs uppercase tracking-widest font-bold text-black/60">
            Integraciones custom
          </span>
        </div>

        <h2 className="text-2xl md:text-3xl font-black text-black mb-3 leading-tight">
          ¿Tu negocio ya tiene sistemas o APIs que conectar?
        </h2>
        <p className="text-base md:text-lg text-black/80 mb-6">
          Si ya tienes CRM, ERP, inventario, Mercado Libre, Shopify, calendario,
          contabilidad, o cualquier sistema interno — el agente puede leer y
          escribir ahí.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mb-2">
          <button
            type="button"
            onClick={() => setOpted(false)}
            className={`flex-1 rounded-xl border-[3px] border-black px-5 py-4 text-left transition-all ${
              opted === false
                ? "bg-brand-grass shadow-[3px_3px_0_0_rgba(0,0,0,1)] -translate-x-0.5 -translate-y-0.5"
                : "bg-white hover:bg-black/5"
            }`}
          >
            <span className="block text-base font-bold text-black">
              No, parto de cero
            </span>
            <span className="block text-xs text-black/60 mt-1">
              Sin sistemas previos. +$0
            </span>
          </button>

          <button
            type="button"
            onClick={() => setOpted(true)}
            className={`flex-1 rounded-xl border-[3px] border-black px-5 py-4 text-left transition-all ${
              opted === true
                ? "bg-brand-yellow shadow-[3px_3px_0_0_rgba(0,0,0,1)] -translate-x-0.5 -translate-y-0.5"
                : "bg-white hover:bg-black/5"
            }`}
          >
            <span className="block text-base font-bold text-black">
              Sí, tengo cosas que conectar
            </span>
            <span className="block text-xs text-black/60 mt-1">
              + {formatMxn(CUSTOM_INTEGRATIONS_MXN)} estimado preliminar*
            </span>
          </button>
        </div>

        <AnimatePresence>
          {opted === true && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="pt-4">
                <Input
                  name="integrations_description"
                  label="¿Qué quieres conectar? (en una línea está bien)"
                  placeholder="Ej: mi CRM en HubSpot, sistema de inventario propio, Mercado Libre…"
                  type="text"
                  value={description}
                  onChange={(e) =>
                    setDescription(
                      (e.target as HTMLInputElement).value
                    )
                  }
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-xs text-black/50 mt-auto pt-4">
          * El precio estimado se ajusta tras revisar tus APIs en la llamada.
          Una integración puede ir de 1 a 30 endpoints.
        </p>
      </motion.div>

      <BrutalButton
        onClick={handleSubmit}
        isDisabled={opted === null}
      >
        Continuar →
      </BrutalButton>
    </div>
  );
};
