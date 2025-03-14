import { useEffect, useRef, useState } from "react";
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
        isSelected={selected === "DOWNLOADABLE"}
        onChange={(value) => setSelected(value)}
        description="Ilustraciones, pdfs, videos, imágenes, etc."
        name="type"
        value="DOWNLOADABLE"
        label="Descargable"
      />
      <RadioInput
        isSelected={selected === "WEBINAR"}
        onChange={(value) => setSelected(value)}
        description="Cursos pre-grabados o en vivo"
        name="type"
        value="WEBINAR"
        label="Curso o Webinar"
      />
      <RadioInput
        isSelected={selected === "EBOOK"}
        onChange={(value) => setSelected(value)}
        description="En formato pdf, ePUB o Mobi"
        name="type"
        value="EBOOK"
        label="E-book"
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
        "group bg-black w-[160px] cursor-pointer relative block rounded-xl"
      )}
    >
      <div
        className={cn(
          "border border-black rounded-xl group-hover:-translate-y-2 group-hover:-translate-x-2 bg-white p-4 transition-all",
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
          className="hidden"
        />
      </div>
    </label>
  );
};
