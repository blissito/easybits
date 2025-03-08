import { Input } from "~/components/common/Input";
import { motion } from "motion/react";
import { useState } from "react";

export const Plantilla = ({ slug, host }: { slug: string; host: string }) => {
  const [value, setValue] = useState("Compra ahora");
  return (
    <motion.section layout>
      <h2 className="text-2xl">Personalización de la plantilla</h2>
      <p className="py-3">Elije el texto para tu botón de compra</p>
      <Input
        onChange={(ev) => setValue(ev.currentTarget.value)}
        value={value}
        placeholder="Compar ahora"
      />
      <p className="py-3">Personaliza el link de tu Asset</p>
      <div className="relative">
        <Input
          defaultValue={slug}
          placeholder="super_curso"
          inputClassName="pl-[240px]"
        />
        <div className="pointer-events-none absolute bottom-0 top-0 grid place-items-center left-2">
          <p className="border border-brand-500 rounded-xl p-1">
            https://{host}.easybits.cloud/
          </p>
        </div>
      </div>
    </motion.section>
  );
};
