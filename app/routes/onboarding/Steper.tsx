import { BrutalButton } from "~/components/common/BrutalButton";
import { Input } from "~/components/common/Input";
import { RadioCardGroup } from "./RadioCardGroup";
import { useForm } from "react-hook-form";
import { BrutalElement } from "~/components/common/BrutalElement";
import { cn } from "~/utils/cn";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

export const Steper = () => {
  return (
    <section className="flex w-full">
      <StepThree />
      <div className="w-full hidden md:block fixed right-0 h-full md:w-[50%] border-2 border-black ">
        <img
          className="h-full w-full object-cover"
          src="/hero/onboarding-2.png"
          alt="onboarding"
        />
      </div>
    </section>
  );
};

//Este es el componente de success cuando completas el onbaording, uselo donde quiera, el copy esta pendiente//
export const OnboardingSuccess = () => {
  return (
    <section className="flex justify-center items-center w-full h-screen text-center">
      <div className="max-w-3xl">
        <img
          className="mx-auto"
          alt="logo completo"
          src="/hero/logo-full.svg"
        />
        <h3 className="text-3xl lg:text-5xl font-bold mt-8">
          ¡Tu cuenta esta lista!
        </h3>
        <p className="text-lg mt-4 mb-10">
          Lorem ipsum dolor sit amet consectetur. Faucibus leo leo leo lectus
          etiam consequat sit adipiscing justo. Sed orci ipsum facilisis euismod
          pellentesque interdum egest
        </p>
        <Link to="/dash">
          <BrutalButton>¡Empezar!</BrutalButton>{" "}
        </Link>
      </div>
    </section>
  );
};

export const StepThree = ({
  onChange,
}: {
  onChange?: (arg0: string) => void;
}) => {
  const [selected, setSelected] = useState("");
  useEffect(() => {
    onChange?.(selected);
  }, [selected]);
  return (
    <div className="w-full h-full min-h-fit lg:min-h-0 box-border flex flex-col md:w-[50%] pt-20 lg:pt-40 px-4 lg:px-20 pb-4 lg:pb-12 ">
      <div className="h-full min-h-fit lg:h-full pb-6">
        <h2 className="text-2xl lg:text-3xl font-bold">
          ¿Qué tipo de assets venderás en EasyBits?
        </h2>
        <p className="text-base lg:text-lg text-iron mt-2 lg:mt-4 mb-6">
          Selecciona la o las opciones que más coincidan con tu contenido
        </p>
        <div className="grid grid-cols-3 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <SmallRadioCard
            value="DISEÑO"
            isSelected={selected === "DISEÑO"}
            title="Diseño"
            description="Iconos, dibujos, templates,  ilustraciones,  modelad 3d."
          />
          <SmallRadioCard
            value="FOTOGRAFIA"
            isSelected={selected === "FOTOGRAFIA"}
            img="/hero/camera.svg"
            title="Fotografía"
            description="Fotos de stock de cualquier tema."
          />
          <SmallRadioCard
            value="CURSOS"
            isSelected={selected === "CURSOS"}
            img="/hero/course.svg"
            title="Cursos"
            description="Idiomas, finanzas, cocina, pintura y más."
          />
          <SmallRadioCard
            value="WEBINARS"
            isSelected={selected === "WEBINARS"}
            img="/hero/micro.svg"
            title=" Webinars"
            description="En vivo o pre-grabados de cualquier tema."
          />
          <SmallRadioCard
            value="AUDIO"
            isSelected={selected === "AUDIO"}
            img="/hero/audio.svg"
            title="Audio y Música"
            description="Tonos, canciones,  tracks o historias de miedo. "
          />
          <SmallRadioCard
            value="SOFTWARE"
            isSelected={selected === "SOFTWARE"}
            img="/hero/code.svg"
            title="Software"
            description="Proyectos, componentes, templates o librerías."
          />
          <SmallRadioCard
            value="CUENTOS"
            isSelected={selected === "CUENTOS"}
            img="/hero/cloud.svg"
            title="Cuentos e historias"
            description="Historias, cuentos, poemas, ensayos o reflexiones. "
          />
          <SmallRadioCard
            value="CLASES"
            isSelected={selected === "CLASES"}
            title="Master Class"
            description="Clases únicas de temas específicos."
            img="/hero/class.svg"
          />
          <SmallRadioCard
            value="LIBROS"
            isSelected={selected === "LIBROS"}
            img="/hero/book.svg"
            title="Libros"
            description="Libros de cocina, ciencia ficción, romance o comedia. "
          />
          <SmallRadioCard
            value="UI"
            isSelected={selected === "UI"}
            img="/default.svg"
            title="Diseño UI"
            description="Mockups, templates o sistemas de diseño."
          />
          <SmallRadioCard
            value="PLANTILLAS"
            isSelected={selected === "PLANTILLAS"}
            img="/hero/template.svg"
            title="Plantillas"
            description="Para KeyNote, Canva, Powe Point, Figma."
          />
          <SmallRadioCard
            value="PAPPERS"
            isSelected={selected === "PAPPERS"}
            title="Pappers"
            description="Pappers de divulgación  o investigación científica."
            img="/hero/science.svg"
          />
        </div>
      </div>
      <BrutalButton className="mt-auto  w-full">Continue</BrutalButton>
    </div>
  );
};

const SmallRadioCard = ({
  img,
  title,
  description,
  onChange,
  isSelected,
  value,
}: {
  img?: string;
  title: string;
  description: string;
  onChange?: (arg0: string) => void;
  isSelected?: boolean;
  value: string;
}) => {
  const ref = useRef(null);

  return (
    <button className={cn("group rounded-xl bg-black h-full")}>
      <div
        className={cn(
          "block w-full col-span-1 relative  rounded-xl transition-all h-full bg-white px-2 py-3  text-left  align-start ",
          "hover:-translate-x-2 hover:-translate-y-2 border border-black   ",
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
        <img className="w-8" src={img ? img : "/hero/art.svg"} />
        <h3 className="font-bold">{title}</h3>
        <p className="text-xs text-iron">{description}</p>
        <input
          ref={ref}
          type="radio"
          name="type"
          value={value}
          onChange={(e) => onChange?.(e.currentTarget.value)}
          className="hidden"
        />
      </div>
    </button>
  );
};

export const StepTwo = ({ profile = { title: "", type: "" } }) => {
  const {
    handleSubmit,
    register,
    formState: { isValid },
    setValue,
  } = useForm({
    defaultValues: profile,
  });
  const registerVirtualFields = () => {
    register("title", { value: "", required: true });
    register("type", { value: "", required: true });
  };
  const handleChange = (name: "title" | "type", value: string) => {
    setValue(name, value, { shouldValidate: true, shouldDirty: true });
  };

  return (
    <div className="w-full h-full flex flex-col md:w-[50%]  pt-20 lg:pt-40 px-4 lg:px-20 pb-4 lg:pb-12 ">
      <div className="h-full">
        <h2 className="text-2xl lg:text-3xl font-bold">
          ¿Qué opción describe mejor tu objetivo al usar EasyBits?
        </h2>
        <p className="text-base lg:text-lg text-iron mt-2 lg:mt-4 mb-16">
          Esto nos ayuda a personalizar tu experiencia
        </p>
        <RadioCardGroup
          onChange={(value: string) => handleChange("type", value)}
        />
      </div>
      <BrutalButton className="mt-auto w-full">Continue</BrutalButton>
    </div>
  );
};

export const StepOne = () => {
  return (
    <div className="w-full h-full flex flex-col md:w-[50%]  pt-20 lg:pt-40 px-4 lg:px-20 pb-4 lg:pb-12 ">
      <div className="h-full">
        <h2 className="text-2xl lg:text-3xl font-bold">
          Personaliza el nombre de tu website y subdominio EasyBits
        </h2>
        <p className="text-base lg:text-lg text-iron mt-2 lg:mt-4 mb-16">
          Escribe tu nombre o el nombre de tu marca que hará destacar tu tienda
        </p>
        <Input />
      </div>
      <BrutalButton className="mt-auto w-full">Continue</BrutalButton>
    </div>
  );
};
