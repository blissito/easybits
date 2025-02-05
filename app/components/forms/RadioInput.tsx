import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { LittleBrutalImage } from "../illustrations/LittleBrutalImage";
import { cn } from "~/utils/cn";

export const RadioGroup = ({
  onChange,
}: {
  onChange?: (arg0: string) => void;
}) => {
  const [selected, setSelected] = useState("");

  useEffect(() => {
    onChange?.(selected);
  }, [selected]);

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
        "group bg-black w-[160px] cursor-pointer relative block rounded-2xl"
      )}
    >
      <div
        className={cn(
          "border border-black rounded-2xl group-hover:-translate-y-2 group-hover:-translate-x-2 bg-white p-4 transition-all",
          {
            "-translate-y-2 -translate-x-2 bg-brand-500": isSelected,
          }
        )}
      >
        <LittleBrutalImage />
        <h4>{label}</h4>
        <p className="text-xs">{description}</p>
        <input
          ref={ref}
          type="radio"
          name={name}
          value={value}
          onChange={(e) => onChange?.(e.currentTarget.value)}
          // hidden
        />
      </div>
    </label>
  );
};
