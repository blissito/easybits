import "easymde/dist/easymde.min.css";
import type { ChangeEvent } from "react";
import { cn } from "~/utils/cn";

// @todo what about a custom one?

export const MarkEditor = ({
  defaultValue,
  rawChange,
  onChange,
  error,
  name,
}: {
  error?: string;
  defaultValue?: string | null;
  name: string;
  rawChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onChange?: (arg0: string) => void;
}) => {
  return (
    <section className="mb-3">
      <p className="pt-3">Descripción</p>
      <p className="text-xs pb-3">Puedes usar markdown</p>
      <textarea
        onChange={(e) => onChange?.(e.currentTarget.value) || rawChange?.(e)}
        name={name}
        className={cn("w-full h-[220px] rounded-2xl focus:ring-brand-500", {
          "ring ring-red-500 border-none": !!error,
        })}
        defaultValue={defaultValue || ""}
      />
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </section>
  );
};
