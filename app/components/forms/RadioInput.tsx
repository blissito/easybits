import { useEffect, useRef, useState, type ReactNode } from "react";
import { LittleBrutalImage } from "../illustrations/LittleBrutalImage";
import { cn } from "~/utils/cn";
import { FaCircleCheck } from "react-icons/fa6";

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
    <section className="flex flex-wrap gap-4 justify-evenly">
      <RadioInput
        isSelected={selected === "DOWNLOADABLE"}
        onChange={(value) => setSelected(value)}
        description="Ilustraciones, imágenes, pdfs, videos,  etc."
        name="type"
        value="DOWNLOADABLE"
        label="Descargable"
        icon="/home/art.svg"
      />
      <RadioInput
        isSelected={selected === "WEBINAR"}
        onChange={(value) => setSelected(value)}
        description="Webinars o conferencias en vivo"
        name="type"
        value="WEBINAR"
        label="Webinar"
        icon="/home/micro.svg"
      />
      <RadioInput
        isSelected={selected === "VOD_COURSE"}
        onChange={(value) => setSelected(value)}
        description="Cursos pre-grabados o en vivo"
        name="type"
        value="VOD_COURSE"
        label="Curso"
        icon="/home/course.svg"
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
  icon,
}: {
  isSelected?: boolean;
  onChange?: (arg0: string) => void;
  description?: string;
  label?: string;
  value: string;
  name: string;
  icon?: string;
}) => {
  const ref = useRef(null);

  return (
    <label
      className={cn(
        "group bg-black w-[120px] grow md:w-[160px] cursor-pointer relative block rounded-xl",
        {
          "bg-brand-500 border border-black": isSelected,
        }
      )}
    >
      <div
        className={cn(
          "border border-black h-full relative rounded-xl group-hover:-translate-y-2 group-hover:-translate-x-2 bg-white p-4 transition-all",
          {
            "-translate-y-2 -translate-x-2 ": isSelected,
          }
        )}
      >
        {isSelected ? (
          <img
            className="w-5 top-3 right-3 absolute"
            src="/home/chec.svg"
            alt="check"
          />
        ) : null}
        <img className="h-10 mb-1" src={icon} alt="descargable" />
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
