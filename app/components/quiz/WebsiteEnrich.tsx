import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { Input } from "~/components/common/Input";
import { BrutalButton } from "~/components/common/BrutalButton";

type WebsiteEnrichProps = {
  email: string;
  formId: string;
  onEnriched: (website: string) => void;
};

export const WebsiteEnrich = ({
  email,
  formId,
  onEnriched,
}: WebsiteEnrichProps) => {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Escribe la URL de tu sitio.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v2/forms/${formId}/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website: trimmed }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(json?.error || "Error al guardar");
      }
      setDone(true);
      onEnriched(trimmed);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message === "Invalid website"
            ? "La URL no se ve bien. Ejemplo: tunegocio.com"
            : "No pudimos guardarlo. Intenta de nuevo."
          : "No pudimos guardarlo. Intenta de nuevo."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-8 max-w-xl mx-auto bg-lime border-2 border-black rounded-2xl px-6 py-4 text-center"
      >
        <p className="text-sm font-bold text-black">
          ✓ Listo — llegamos a tu llamada conociendo tu sitio.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="mt-8 max-w-xl mx-auto bg-white/70 border-2 border-black rounded-2xl px-6 py-5"
    >
      <p className="text-xs uppercase tracking-widest font-bold text-black/60 mb-1">
        🔍 Activa tu análisis de sitio gratis
      </p>
      <p className="text-base md:text-lg font-bold text-black mb-3">
        Pega tu URL — llegamos a la llamada con propuestas concretas.
      </p>
      <div className="flex flex-col md:flex-row gap-3">
        <Input
          name="website"
          placeholder="tunegocio.com"
          type="text"
          value={value}
          onChange={(e) =>
            setValue((e.target as HTMLInputElement).value)
          }
          className="flex-1"
        />
        <BrutalButton type="submit" mode="brand" isLoading={submitting}>
          Agregar al análisis
        </BrutalButton>
      </div>
      {error && (
        <p className="text-sm text-red-600 font-bold mt-3">{error}</p>
      )}
      <p className="text-xs text-black/60 mt-3">
        Lo revisamos antes de la llamada — te ahorra explicarnos todo desde
        cero.
      </p>
    </motion.form>
  );
};
