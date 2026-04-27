import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { Input } from "~/components/common/Input";
import { BrutalButton } from "~/components/common/BrutalButton";

export type LeadData = {
  name: string;
  email: string;
  whatsapp: string;
  website: string;
  business: string;
  description: string;
};

type LeadFormProps = {
  onSubmit: (data: LeadData) => void | Promise<void>;
  isLoading?: boolean;
};

const normalizeWebsite = (raw: string): string => {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

export const LeadForm = ({ onSubmit, isLoading }: LeadFormProps) => {
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const data: LeadData = {
      name: String(fd.get("name") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      whatsapp: String(fd.get("whatsapp") || "").trim(),
      website: normalizeWebsite(String(fd.get("website") || "")),
      business: String(fd.get("business") || "").trim(),
      description: String(fd.get("description") || "").trim(),
    };
    if (!data.name || !data.email || !data.whatsapp) {
      setError("Necesitamos al menos nombre, email y WhatsApp.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(data.email)) {
      setError("Ese email no se ve bien.");
      return;
    }
    if (data.whatsapp.replace(/\D/g, "").length < 10) {
      setError("Ese WhatsApp se ve corto. Incluye lada (ej. 521…).");
      return;
    }
    if (data.website && !/\.\w{2,}/.test(data.website)) {
      setError("La URL no se ve bien. Ejemplo: tunegocio.com");
      return;
    }
    onSubmit(data);
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-xl mx-auto flex flex-col gap-5"
    >
      <div className="text-center mb-2">
        <h2 className="text-3xl md:text-4xl font-black text-black mb-2">
          ¿A nombre de quién va?
        </h2>
        <p className="text-base text-black/70">
          Te contactamos en menos de 24h con una propuesta personalizada.
          Sin spam.
        </p>
      </div>

      {/* Bloque 1 — contacto */}
      <fieldset className="flex flex-col gap-4">
        <legend className="text-xs uppercase tracking-widest font-bold text-black/60 mb-2">
          ¿Cómo te contacto?
        </legend>
        <Input
          name="name"
          label="Tu nombre"
          placeholder="María López"
          type="text"
        />
        <Input
          name="email"
          label="Email"
          placeholder="maria@negocio.com"
          type="email"
        />
        <Input
          name="whatsapp"
          label="WhatsApp con lada"
          placeholder="+52 55 1234 5678"
          type="text"
        />
      </fieldset>

      {/* Bloque 2 — sobre el negocio */}
      <fieldset className="flex flex-col gap-4 pt-4 border-t-2 border-black/10">
        <legend className="text-xs uppercase tracking-widest font-bold text-black/60 mb-2">
          ¿Sobre qué negocio hablamos?
        </legend>

        <div className="flex flex-col gap-1">
          <Input
            name="website"
            label="🔍 Sitio web del negocio"
            placeholder="tunegocio.com"
            type="text"
          />
          <p className="text-xs text-black/60 pl-1">
            Si lo compartes, llegamos a la llamada conociendo tu negocio.
            Te ahorra explicárnoslo todo desde cero.
          </p>
        </div>

        <Input
          name="business"
          label="Nombre del negocio (opcional)"
          placeholder="Refacciones López"
          type="text"
        />
        <Input
          name="description"
          label="¿Qué vendes en una línea? (opcional, si no tienes sitio)"
          placeholder="Refacciones de auto en Iztapalapa."
          type="text"
        />
      </fieldset>

      {error && (
        <p className="text-sm text-red-600 font-bold text-center">{error}</p>
      )}

      <div className="flex justify-center mt-2">
        <BrutalButton type="submit" mode="brand" isLoading={isLoading}>
          Ver mi cotización final
        </BrutalButton>
      </div>
    </motion.form>
  );
};
