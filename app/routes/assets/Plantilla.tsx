import { Input } from "~/components/common/Input";
import { motion } from "motion/react";
import { useEffect, useState, type ChangeEvent } from "react";
import { CopyButton } from "~/components/common/CopyButton";
import slugify from "slugify";

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
  const [state, setState] = useState({
    ctaText: "Compra ahora",
    templateName: "default",
    ...template, // @todo take host out of template
    slug,
    host,
  });

  const update = (obj: Record<string, string>) => {
    setState((st) => ({ ...st, ...obj }));
  };

  const handleChange =
    (field: string) => (event: ChangeEvent<HTMLInputElement>) => {
      const formated = slugify(event.currentTarget.value);
      update({ [field]: formated });
    };

  useEffect(() => {
    onChange?.(state);
  }, [state]);

  return (
    <motion.section layout>
      <h2 className="text-2xl font-bold">Personaliza tu plantilla</h2>
      <p className="pt-3 pb-2">Elije el texto para tu botón de compra</p>
      <Input
        onChange={handleChange("ctaText")}
        value={state.ctaText}
        placeholder="Compar ahora"
        isError={!!error}
      />
      <p className="pt-5 pb-1">Personaliza el link de tu Asset</p>
      <div className="relative flex items-center gap-1">
        <p className="border border-brand-500 rounded-xl p-2 pointer-events-none min-w-max  grid place-items-center h-12">
          https://{state.host}.easybits.cloud/tienda/
        </p>
        <Input
          value={state.slug}
          placeholder="super_curso"
          inputClassName="text-md pr-12 truncate"
          onChange={handleChange("slug")}
          isError={!!error}
        />
        <CopyButton
          text={`https://${state.host}.easybits.cloud/tienda/${state.slug}`}
          className="absolute right-2 top-2 border rounded-xl p-1 hover:shadow h-8 w-8 flex justify-center items-center"
        />
      </div>
      {error && (
        <p className="text-xs text-red-500">Personaliza tu plantilla</p>
      )}
    </motion.section>
  );
};
