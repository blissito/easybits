import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { Input } from "~/components/common/Input";
import { BrutalButton } from "~/components/common/BrutalButton";

// website se llena después vía WebsiteEnrich (post-summary). business y
// description quedan fuera porque el form sólo pide los 3 datos esenciales
// (nombre, email, whatsapp) — añadir más campos baja la conversión del lead.
export type LeadData = {
  name: string;
  email: string;
  whatsapp: string;
  website: string;
};

type LeadFormProps = {
  onSubmit: (data: LeadData) => void | Promise<void>;
  isLoading?: boolean;
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
      website: "",
    };
    if (!data.name || !data.email || !data.whatsapp) {
      setError("Necesitamos nombre, email y WhatsApp para mandarte la cotización.");
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
        <h2 className="text-3xl md:text-4xl font-black text-black mb-2 leading-tight">
          Falta 1 paso para ver tu precio final
        </h2>
        <p className="text-base text-black/70">
          Te mandamos la cotización por email con PDF adjunto. Sin spam.
        </p>
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-xs uppercase tracking-widest font-bold text-black/60 mb-2">
          ¿A dónde te mandamos tu cotización?
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

      {error && (
        <p className="text-sm text-red-600 font-bold text-center">{error}</p>
      )}

      <div className="flex justify-center mt-2">
        <BrutalButton
          type="submit"
          mode="brand"
          isLoading={isLoading}
          containerClassName="h-16 md:h-20"
          className="h-16 md:h-20 px-8 md:px-12 text-xl md:text-2xl"
        >
          Ver mi precio →
        </BrutalButton>
      </div>

      <p className="text-xs text-black/60 text-center mt-1">
        🔒 Solo usamos tus datos para mandarte la propuesta. Sin reventa, sin spam.
      </p>
    </motion.form>
  );
};
