import { useEffect, useRef, useState } from "react";
import { cn } from "~/utils/cn";

export const RadioCardGroup = ({
  onChange,
  defaultValue,
}: {
  defaultValue?: string;
  onChange?: (arg0: string) => void;
}) => {
  const [selected, setSelected] = useState(defaultValue || "");

  useEffect(() => {
    onChange?.(selected);
  }, [selected]);

  return (
    <section className="flex flex-col gap-6 justify-evenly">
      <RadioCard
        isSelected={selected === "BEGINNER"}
        onChange={setSelected}
        description="Apenas estoy empezando a crear contenido digital y quiero compartirlo con amigos y conocidos "
        name="type"
        value="BEGINNER"
        label="Creador Revelación"
        icon="/hero/option0.svg"
      />
      <RadioCard
        isSelected={selected === "INDIE"}
        onChange={setSelected}
        description="Cuento con una base de seguidores y busco monetizar mi audiencia vendiendo mi arte"
        name="type"
        value="INDIE"
        label="Creador Indie"
        icon="/hero/option1.svg"
      />
      <RadioCard
        isSelected={selected === "PROFESIONAL"}
        onChange={setSelected}
        description="Cuento con un negocio establecido y quiero vender mis productos digitales en línea"
        name="type"
        value="PROFESIONAL"
        label="Creador Profesional"
        icon="/hero/option2.svg"
      />
    </section>
  );
};

export const RadioCard = ({
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
  const ref = useRef();

  return (
    <label
      className={cn(
        "group bg-black w-full cursor-pointer relative  z-0 block rounded-xl",
        {
          "bg-brand-500 border-black border": isSelected,
        }
      )}
    >
      <div
        className={cn(
          "border border-black flex gap-4 lg:gap-10 justify-between relative rounded-xl group-hover:-translate-y-2 group-hover:-translate-x-2 bg-white p-4 transition-all",
          {
            "-translate-y-2 -translate-x-2 ": isSelected,
          }
        )}
      >
        {isSelected ? (
          <img
            className="w-5 top-3 right-3 absolute"
            src="/hero/chec.svg"
            alt="check"
          />
        ) : null}
        <div>
          <h4 className="text-xl font-bold">{label}</h4>
          <p className="lg:text-base text-iron text-xs">{description}</p>
          <input
            ref={ref}
            type="radio"
            name={name}
            value={value}
            onChange={(e) => onChange?.(e.currentTarget.value)}
            className="hidden"
          />
        </div>
        <img className="h-16 md:h-20 mb-1" src={icon} alt="descargable" />
      </div>
    </label>
  );
};
