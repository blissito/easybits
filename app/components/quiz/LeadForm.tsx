import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { Input } from "~/components/common/Input";
import { BrutalButton } from "~/components/common/BrutalButton";

export type LeadData = {
  name: string;
  email: string;
  whatsapp: string;
  business: string;
  description: string;
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
    onSubmit(data);
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-xl mx-auto flex flex-col gap-4"
    >
      <div className="text-center mb-4">
        <h2 className="text-3xl md:text-4xl font-black text-black mb-2">
          ¿A nombre de quién va?
        </h2>
        <p className="text-base text-black/70">
          Te contacto en menos de 24h para arrancar el setup. Sin spam, sin
          ventas raras.
        </p>
      </div>

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
        label="WhatsApp (con lada)"
        placeholder="+52 55 1234 5678"
        type="text"
      />
      <Input
        name="business"
        label="Negocio (opcional)"
        placeholder="Refacciones López"
        type="text"
      />
      <Input
        name="description"
        label="¿Qué hace tu negocio en una línea? (opcional)"
        placeholder="Vendemos refacciones de auto en Iztapalapa."
        type="text"
      />

      {error && (
        <p className="text-sm text-red-600 font-bold">{error}</p>
      )}

      <BrutalButton type="submit" mode="brand" isLoading={isLoading}>
        Ver mi cotización final
      </BrutalButton>
    </motion.form>
  );
};
