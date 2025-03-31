import { Input } from "~/components/common/Input";
import { motion } from "motion/react";
import { useEffect, useState, type ChangeEvent } from "react";

export const Plantilla = ({
  onChange,
  template,
  slug,
  host,
  error,
}: {
  error?: string;
  onChange?: (arg0: Record<string, string>) => void;
  template?: { ctaText?: string; templateName?: string; domain?: string };
  slug: string;
  host: string;
}) => {
  const [state, setState] = useState(
    template || {
      ctaText: "Compra ahora",
      templateName: "default",
      host,
      slug,
    }
  );

  const update = (obj: Record<string, string>) => {
    setState((st) => ({ ...st, ...obj }));
  };

  const handleChange =
    (field: string) => (event: ChangeEvent<HTMLInputElement>) => {
      update({ [field]: event.currentTarget.value });
    };

  useEffect(() => {
    onChange?.(state);
  }, [state]);

  return (
    <motion.section layout>
      <h2 className="text-2xl">Personaliza tu plantilla</h2>
      <p className="pt-2 pb-0">Elije el texto para tu botón de compra</p>
      <Input
        onChange={handleChange("ctaText")}
        value={state.ctaText}
        placeholder="Compar ahora"
        isError={!!error}
      />
      <p className="pt-2 pb-0">Personaliza el link de tu Asset</p>
      <div className="relative">
        <Input
          value={state.slug}
          placeholder="super_curso"
          inputClassName="pl-[254px]"
          onChange={handleChange("slug")}
          isError={!!error}
        />
        <div className="pointer-events-none absolute bottom-0 top-0 grid place-items-center left-2">
          <p className="border border-brand-500 rounded-xl p-1">
            https://{state.host}.easybits.cloud/p/
          </p>
        </div>
      </div>
      {error && (
        <p className="text-xs text-red-500">Personaliza tu plantilla</p>
      )}
    </motion.section>
  );
};
