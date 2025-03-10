import "easymde/dist/easymde.min.css";
import type { ChangeEvent } from "react";

// @todo what about a custom one?

export const MarkEditor = ({
  defaultValue,
  rawChange,
  onChange,
  name,
}: {
  defaultValue?: string | null;
  name: string;
  rawChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onChange?: (arg0: string) => void;
}) => {
  return (
    <section className="mt-8 mb-3">
      <h2 className="text-2xl">Detalles de tu Asset</h2>
      <p className="pt-3">Descripción</p>
      <p className="text-xs pb-3">Puedes usar markdown</p>
      <textarea
        onChange={(e) => onChange?.(e.currentTarget.value) || rawChange?.(e)}
        name={name}
        className="w-full h-[220px]"
        defaultValue={defaultValue}
      />
    </section>
  );
};
