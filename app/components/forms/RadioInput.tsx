import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { LittleBrutalImage } from "../illustrations/LittleBrutalImage";
import { cn } from "~/utils/cn";

export const RadioGroup = () => {
  const [selected, setSelected] = useState("");
  return (
    <section className="flex gap-4 justify-evenly">
      <RadioInput
        isSelected={selected === "download"}
        onChange={(value) => setSelected(value)}
        description="Ilustraciones, pdfs, videos, imágenes, etc."
        name="type"
        value="download"
        label="Descargables"
      />
      <RadioInput
        isSelected={selected === "course"}
        onChange={(value) => setSelected(value)}
        description="Cursos pre-grabados en formato xxx"
        name="type"
        value="course"
        label="Cursos"
      />
      <RadioInput
        isSelected={selected === "e-book"}
        onChange={(value) => setSelected(value)}
        description="En formato pdf, ePUB o Mobi"
        name="type"
        value="e-book"
        label="E-books"
      />
    </section>
  );
};

export const RadioInput = ({
  name,
  isSelected,
  value,
  label,
  description,
  onChange,
}: {
  isSelected?: boolean;
  onChange?: (arg0: string) => void;
  description?: string;
  label?: string;
  value: string;
  name: string;
}) => {
  const ref = useRef(null);

  return (
    <label
      className={cn(
        "group bg-white border p-4 w-[160px] border-black rounded-2xl cursor-pointer relative",
        {
          "bg-brand-500": isSelected,
        }
      )}
    >
      <div
        className={cn(
          "absolute inset-0 bg-black z-[-10] rounded-2xl group-hover:translate-y-2 group-hover:translate-x-2 transition-all",
          {
            "translate-y-2 translate-x-2": isSelected,
          }
        )}
      />
      <LittleBrutalImage />
      <h4>{label}</h4>
      <p className="text-xs">{description}</p>
      <input
        ref={ref}
        type="radio"
        name={name}
        value={value}
        onChange={(e) => onChange?.(e.currentTarget.value)}
        hidden
      />
    </label>
  );
};
