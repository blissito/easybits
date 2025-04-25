import { useEffect, useRef, useState } from "react";
import { cn } from "~/utils/cn";

export const RadioCardGroup = ({
  onChange,
}: {
  onChange?: (arg0: string) => void;
}) => {
  const [selected, setSelected] = useState("");

  useEffect(() => {
    onChange?.(selected);
  }, [selected]);

  return (
    <section className="flex flex-col gap-6 justify-evenly">
      <RadioCard
        isSelected={selected === "BEGINNER"}
        onChange={(value) => setSelected(value)}
        description="Apenas estoy empezando a crear contenido digital y quiero compartirlo con amigos y conocidos "
        name="type"
        value="BEGINNER"
        label="Creador Revelación"
        icon="/hero/course.svg"
      />
      <RadioCard
        isSelected={selected === "INDIE"}
        onChange={(value) => setSelected(value)}
        description="Cuento con una base de seguidores y busco monetizar mi audiencia vendiendo mi arte"
        name="type"
        value="INDIE"
        label="Creador Indie"
        icon="/hero/art.svg"
      />
      <RadioCard
        isSelected={selected === "PROFESIONAL"}
        onChange={(value) => setSelected(value)}
        description="Cuento con un negocio establecido y quiero vender mis productos digitales en línea"
        name="type"
        value="PROFESIONAL"
        label="Creador Profesional"
        icon="/hero/micro.svg"
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
        "group bg-black w-full cursor-pointer relative block rounded-xl"
      )}
    >
      <div
        className={cn(
          "border border-black flex gap-10 justify-between relative rounded-xl group-hover:-translate-y-2 group-hover:-translate-x-2 bg-white p-4 transition-all",
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
          <p className="text-base text-iron">{description}</p>
          <input
            ref={ref}
            type="radio"
            name={name}
            value={value}
            onChange={(e) => onChange?.(e.currentTarget.value)}
            className="hidden"
          />
        </div>
        <img
          className="h-20 mb-1"
          src="https://i.imgur.com/JjN1Q0l.png"
          alt="descargable"
        />
      </div>
    </label>
  );
};
