import { useState, type KeyboardEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Input } from "~/components/common/Input";
import { BrutalButton } from "~/components/common/BrutalButton";
import {
  CUSTOM_INTEGRATIONS_DISCOVERY_MXN,
  CUSTOM_INTEGRATIONS_FROM_MXN,
} from "~/lib/quiz/capabilities";
import { formatMxn } from "~/lib/quiz/pricing";

export type IntegrationsAnswer = {
  hasIntegrations: boolean;
  items: string[];
  description: string;
};

type IntegrationsStepProps = {
  onAnswer: (answer: IntegrationsAnswer) => void;
};

// MX-focused suggestions, prioritized by relevance for SMB/agency/freelance.
const SUGGESTED = [
  "Kommo",
  "HubSpot",
  "Mercado Libre",
  "Tienda Nube",
  "Shopify",
  "CFDI / SAT",
  "CONTPAQi",
  "Aspel",
  "Conekta",
  "Clip",
  "Stripe",
  "Calendly",
  "Google Calendar",
  "Notion",
  "Inventario propio",
];

export const IntegrationsStep = ({ onAnswer }: IntegrationsStepProps) => {
  const [opted, setOpted] = useState<boolean | null>(null);
  const [items, setItems] = useState<string[]>([]);
  const [current, setCurrent] = useState("");

  const addItem = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (items.some((it) => it.toLowerCase() === trimmed.toLowerCase())) {
      setCurrent("");
      return;
    }
    setItems((prev) => [...prev, trimmed]);
    setCurrent("");
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addItem(current);
    } else if (e.key === "Backspace" && current === "" && items.length > 0) {
      removeItem(items.length - 1);
    }
  };

  const handleSubmit = () => {
    if (opted === null) return;
    // If user typed something and didn't add it, add on submit.
    const finalItems =
      opted &&
      current.trim() &&
      !items.some((it) => it.toLowerCase() === current.trim().toLowerCase())
        ? [...items, current.trim()]
        : items;

    onAnswer({
      hasIntegrations: opted,
      items: opted ? finalItems : [],
      description: opted ? finalItems.join(" · ") : "",
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
            <span className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-black text-white text-[10px] font-black uppercase tracking-wider rounded-md">
                Discovery
              </span>
              <span className="text-xs font-bold text-black tabular-nums">
                {formatMxn(CUSTOM_INTEGRATIONS_DISCOVERY_MXN)}
              </span>
              <span className="text-xs text-black/50">+</span>
              <span className="text-xs text-black/70">
                desarrollo desde{" "}
                <span className="font-bold text-black tabular-nums">
                  {formatMxn(CUSTOM_INTEGRATIONS_FROM_MXN)}
                </span>
                *
              </span>
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
                {/* Chips of added items */}
                {items.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    <AnimatePresence initial={false}>
                      {items.map((it, idx) => (
                        <motion.span
                          key={`${it}-${idx}`}
                          initial={{ opacity: 0, scale: 0.6 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.6 }}
                          transition={{ duration: 0.15 }}
                          className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 bg-brand-yellow border-[2.5px] border-black rounded-full text-sm font-bold shadow-[2px_2px_0_0_rgba(0,0,0,1)]"
                        >
                          <span>{it}</span>
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            aria-label={`Quitar ${it}`}
                            className="w-5 h-5 rounded-full bg-black text-white text-xs font-black flex items-center justify-center hover:bg-black/80"
                          >
                            ×
                          </button>
                        </motion.span>
                      ))}
                    </AnimatePresence>
                  </div>
                )}

                <Input
                  name="integrations_item"
                  label={`¿Qué quieres conectar? (Enter o coma para agregar más${items.length > 0 ? ` · ${items.length} agregada${items.length === 1 ? "" : "s"}` : ""})`}
                  placeholder="Ej: HubSpot CRM, Mercado Libre, Google Calendar…"
                  type="text"
                  value={current}
                  onChange={(e) =>
                    setCurrent((e.target as HTMLInputElement).value)
                  }
                  onKeyDown={handleKeyDown}
                />

                {/* Suggestions — always visible, filtered to hide already-added */}
                {(() => {
                  const lower = new Set(items.map((it) => it.toLowerCase()));
                  const remaining = SUGGESTED.filter(
                    (s) => !lower.has(s.toLowerCase())
                  );
                  if (remaining.length === 0) return null;
                  return (
                    <div className="mt-3 flex flex-wrap gap-1.5 items-start">
                      <span className="text-xs text-black/55 mr-1 mt-1.5">
                        Sugerencias:
                      </span>
                      {remaining.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => addItem(s)}
                          className="text-xs px-2.5 py-1 rounded-full border border-black/30 text-black/70 hover:bg-black hover:text-white hover:border-black transition-colors"
                        >
                          + {s}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-xs text-black/50 mt-auto pt-4">
          * Discovery (no reembolsable, acreditable al desarrollo si avanzas en
          30 días) + cotización formal por complejidad: simple desde $3,000,
          media desde $8,000, compleja (SAP/ERP) desde $20,000.
        </p>
      </motion.div>

      <BrutalButton onClick={handleSubmit} isDisabled={opted === null}>
        Continuar →
      </BrutalButton>
    </div>
  );
};
