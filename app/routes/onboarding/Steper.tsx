import { BrutalButton } from "~/components/common/BrutalButton";
import { Input } from "~/components/common/Input";
import { RadioCardGroup } from "./RadioCardGroup";
import { cn } from "~/utils/cn";
import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";
import type { User } from "@prisma/client";
import { AnimatePresence, motion } from "motion/react";
import { BrendisConfetti } from "~/components/Confetti";

//Usa la imagen onboarding-1 para la primer pregunta y onboarding-2 para la segunda y tercera
export const Steper = ({ user }: { user: User }) => {
  const [step, setStep] = useState(0);
  const fetcher = useFetcher();

  const [host, setHost] = useState(user.host);
  const [metadata, setMetadata] = useState(
    (user.metadata || { metadata: {}, asset_types: [] }) as User["metadata"]
  );
  const handleStep = (step: number) => async () => {
    if (step === 2) {
      await fetcher.submit(
        {
          intent: "update_profile",
          data: JSON.stringify({
            metadata: {
              customer_type: metadata!.customer_type,
              asset_types: metadata!.asset_types,
            },
          }),
        },
        { method: "post", action: "/api/v1/user" }
      );
      setStep(3);
    }
    if (step === 1) {
      await fetcher.submit(
        {
          intent: "update_profile",
          data: JSON.stringify({
            metadata: {
              customer_type: metadata!.customer_type,
              asset_types: metadata!.asset_types,
            },
          }),
        },
        { method: "post", action: "/api/v1/user" }
      );
      setStep(2);
    }
    if (step === 0) {
      // @todo revisit
      fetcher.submit(
        {
          intent: "update_host",
          host,
          userId: user.id,
        },
        { method: "post", action: "/api/v1/user" }
      );
    }
  };

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data.nextStep === 1) {
      setStep(1);
    }
  }, [fetcher]);

  const isLoading = fetcher.state !== "idle";
  const error = fetcher.data?.error;

  const handleMetadataChange = (name: string, value: string) => {
    setMetadata((m) => ({ ...m, [name]: value }));
  };

  const handleAssetTypes = (value: string[]) => {
    setMetadata((m) => ({ ...m, asset_types: value }));
  };
  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth",
    });
  }, []);

  const getStep = () => {
    switch (step) {
      case 3:
        return <OnboardingSuccess />;
      case 2:
        return (
          <StepThree
            isLoading={isLoading}
            defaultValue={user.metadata?.asset_types}
            onChange={handleAssetTypes}
            onClick={handleStep(2)}
          />
        );
      case 1:
        return (
          <StepTwo
            isLoading={isLoading}
            defaultValue={user.metadata?.customer_type}
            onChange={(value) => handleMetadataChange("customer_type", value)}
            onClick={handleStep(1)}
          />
        );
      case 0:
        return (
          <StepOne
            isLoading={isLoading}
            error={error}
            value={host}
            onChange={setHost}
            onClick={handleStep(0)}
          />
        );
    }
  };
  const images = ["/home/onboarding-1.webp", "/home/onboarding-2.webp"];
  return (
    <section className="flex w-full h-svh  overflow-x-hidden">
      <AnimatePresence>{getStep()}</AnimatePresence>
      {step !== 3 && (
        <div className="w-full hidden md:block fixed right-0 h-full md:w-[50%] border-2 border-black ">
          <img
            className="h-full w-full object-cover"
            src={step === 0 ? images[0] : images[1]}
            alt="onboarding"
          />
        </div>
      )}
    </section>
  );
};

//Este es el componente de success cuando completas el onbaording, uselo donde quiera, el copy esta pendiente//
export const OnboardingSuccess = () => {
  return (
    <section
      // transition={{ type: "spring", bounce: 0 }}
      // key="step_four"
      // initial={{ y: -100, opacity: 0, scale: 0.5 }}
      // animate={{ y: 0, opacity: 1, scale: 1 }}
      // exit={{ y: 100, opacity: 0, scale: 0.8 }}
      className="flex justify-center items-center w-full h-svh text-center px-4 md:px-[5%] min-h-[500px] "
    >
      <div className="max-w-3xl ">
        <img
          className="mx-auto max-w-56"
          alt="logo completo"
          src="/images/logo-animation.gif"
        />

        <h3 className="text-3xl lg:text-5xl font-bold mt-0">
          ¡Tu cuenta está lista!
        </h3>
        <p className="text-lg mt-4 mb-10">
          Todo está en su lugar. Es hora de poner manos a la obra y crear tu
          primer asset.
          <br /> ¡Qué emoción, ya pronto vamos a vender!
        </p>
        <Link to="/dash">
          <BrutalButton>¡Empezar!</BrutalButton>
        </Link>
      </div>
      {/* <EmojiConfetti emojis={false} /> */}
      {/* Aún estoy experimentando */}
      <BrendisConfetti />
    </section>
  );
};

export const StepThree = ({
  onChange,
  isLoading,
  defaultValue = [],
  onClick,
}: {
  isLoading?: boolean;
  defaultValue?: string[];
  onClick?: () => void;
  onChange?: (arg0: string[]) => void;
}) => {
  const [selected, setSelected] = useState<string[]>(defaultValue);
  const add = (value: string) => {
    setSelected((s) => [...s, value]);
  };
  const remove = (value: String) => {
    setSelected((s) => s.filter((v) => v !== value));
  };
  const toggle = (value: string) => () => {
    selected.includes(value) ? remove(value) : add(value);
  };
  useEffect(() => {
    onChange?.(selected);
  }, [selected]);

  return (
    <motion.div
      key="step_three"
      transition={{ type: "spring", bounce: 0 }}
      initial={{ y: -100, opacity: 0, scale: 0.8 }}
      animate={{ y: 0, x: 0, opacity: 1, scale: 1 }}
      exit={{ y: 100, x: 0, opacity: 0, scale: 0.8 }}
      className="w-full  min-h-[1000px] xl:min-h-0  h-full   flex flex-col md:w-[50%] pt-20 lg:pt-28 px-4 xl:px-20 pb-4 xl:pb-12 "
    >
      <div className="w-full h-full  min-h-fit  pb-6 ">
        <h2 className="text-2xl lg:text-3xl font-bold">
          ¿Qué tipo de assets venderás en EasyBits?
        </h2>
        <p className="text-base lg:text-lg mt-2 lg:mt-4 mb-6 text-iron lg:mb-10">
          Selecciona la o las opciones que más coincidan con tu contenido
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4  md:grid-cols-2 xl:grid-cols-4 gap-4">
          <SmallRadioCard
            onClick={toggle("diseño")}
            isSelected={selected.includes("diseño")}
            value="DISEÑO"
            title="Diseño"
            description="Iconos, dibujos, templates,  ilustraciones,  modelad 3d."
          />
          <SmallRadioCard
            onClick={toggle("fotografía")}
            isSelected={selected.includes("fotografía")}
            img="/home/camera.svg"
            title="Fotografía"
            description="Fotos de stock de cualquier tema."
          />
          <SmallRadioCard
            onClick={toggle("cursos")}
            isSelected={selected.includes("cursos")}
            img="/home/course.svg"
            title="Cursos"
            description="Idiomas, finanzas, cocina, pintura y más."
          />
          <SmallRadioCard
            onClick={toggle("webinars")}
            isSelected={selected.includes("webinars")}
            img="/home/micro.svg"
            title=" Webinars"
            description="En vivo o pre-grabados de cualquier tema."
          />
          <SmallRadioCard
            onClick={toggle("audio")}
            isSelected={selected.includes("audio")}
            img="/home/audio.svg"
            title="Audio y Música"
            description="Tonos, canciones,  tracks o historias de miedo. "
          />
          <SmallRadioCard
            onClick={toggle("software")}
            isSelected={selected.includes("software")}
            img="/home/code.svg"
            title="Software"
            description="Proyectos, componentes, templates o librerías."
          />
          <SmallRadioCard
            onClick={toggle("cuentos")}
            isSelected={selected.includes("cuentos")}
            img="/home/cloud.svg"
            title="Cuentos e historias"
            description="Historias, cuentos, poemas, ensayos o reflexiones. "
          />
          <SmallRadioCard
            onClick={toggle("clases")}
            isSelected={selected.includes("clases")}
            title="Master Class"
            description="Clases únicas de temas específicos."
            img="/home/class.svg"
          />
          <SmallRadioCard
            onClick={toggle("libros")}
            isSelected={selected.includes("libros")}
            img="/home/book.svg"
            title="Libros"
            description="De cocina, ciencia ficción, romance o comedia. "
          />
          <SmallRadioCard
            onClick={toggle("ui")}
            isSelected={selected.includes("ui")}
            img="/home/default.webp"
            title="Diseño UI"
            description="Mockups, templates o sistemas de diseño."
          />
          <SmallRadioCard
            onClick={toggle("plantillas")}
            isSelected={selected.includes("plantillas")}
            img="/home/template.svg"
            title="Plantillas"
            description="Para Excel, Canva, Powe-Point, Figma, etc."
          />
          <SmallRadioCard
            onClick={toggle("pappers")}
            isSelected={selected.includes("pappers")}
            title="Pappers"
            description="Pappers de investigación o divulgación científica."
            img="/home/science.svg"
          />
        </div>
      </div>
      <BrutalButton
        isLoading={isLoading}
        onClick={onClick}
        type="button"
        isDisabled={selected.length < 1}
        containerClassName="mt-auto "
        className="w-full"
      >
        Continuar
      </BrutalButton>
    </motion.div>
  );
};

const SmallRadioCard = ({
  img,
  title,
  description,
  onChange,
  isSelected,
  value,
  onClick,
}: {
  onClick?: () => void;
  img?: string;
  title: string;
  description: string;
  onChange?: (arg0: string) => void;
  isSelected?: boolean;
  value?: string;
}) => {
  const ref = useRef(null);

  return (
    <button
      onClick={onClick}
      className={cn("group rounded-xl bg-black h-full ", {
        "bg-brand-500 border border-black": isSelected,
      })}
    >
      <div
        className={cn(
          "block w-full col-span-1 relative   rounded-xl transition-all h-full bg-white px-2 py-2  text-left  align-start ",
          "hover:-translate-x-2 hover:-translate-y-2 border border-black   ",
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
        <img className="w-8" src={img ? img : "/home/art.svg"} />
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

export const StepTwo = ({
  onChange,
  defaultValue,
  onClick,
  isLoading,
}: {
  isLoading?: boolean;
  onClick?: () => void;
  onChange?: (arg0: string) => void;
  defaultValue?: string;
}) => {
  const [customer_type, setCustomerType] = useState(defaultValue || "");

  const handleChange = (value: string) => {
    setCustomerType(value);
    onChange?.(value);
  };

  return (
    <motion.div
      transition={{ type: "spring", bounce: 0 }}
      key="step_two"
      initial={{ y: -100, opacity: 0, scale: 0.8 }}
      animate={{ y: 0, x: 0, opacity: 1, scale: 1 }}
      exit={{ y: 100, x: 0, opacity: 0, scale: 0.8 }}
      className="w-full min-h-[680px]  xl:min-h-0 h-full flex  flex-col md:w-[50%] pt-20  lg:pt-28 px-4 xl:px-20 pb-4 xl:pb-12 "
    >
      <div className="w-full h-full pb-6 min-h-[364px] md:min-h-fit  ">
        <h2 className="text-2xl lg:text-3xl font-bold">
          ¿Qué opción te describe mejor al usar EasyBits?
        </h2>
        <p className="text-base lg:text-lg text-iron mt-2 lg:mt-4 mb-6 lg:mb-10">
          Esto nos ayuda a personalizar tu experiencia. 🥸
        </p>
        <RadioCardGroup defaultValue={defaultValue} onChange={handleChange} />
      </div>
      <BrutalButton
        isLoading={isLoading}
        type="button"
        onClick={onClick}
        isDisabled={!customer_type}
        className="mt-auto w-full"
      >
        Continuar
      </BrutalButton>
    </motion.div>
  );
};

export const StepOne = ({
  onClick,
  value,
  onChange,
  error,
  isLoading,
}: {
  isLoading?: boolean;
  onClick?: () => void;
  onChange?: (arg0: string) => void;
  value: string;
  error?: string;
}) => {
  return (
    <motion.div
      transition={{ type: "spring", bounce: 0 }}
      key="step_one"
      initial={{ y: -10, opacity: 0, scale: 0.8 }}
      animate={{ y: 0, x: 0, opacity: 1, scale: 1 }}
      exit={{ y: 10, x: 0, opacity: 0, scale: 0.8 }}
      className="w-full h-full flex flex-col md:w-[50%] pt-20  lg:pt-28  px-4 xl:px-20 pb-4 xl:pb-12 "
    >
      <div className="h-full">
        <h2 className="text-2xl lg:text-3xl font-bold">
          Personaliza el nombre de tu website y subdominio EasyBits
        </h2>
        <p className="text-base lg:text-lg text-iron mt-2 lg:mt-4 mb-6 lg:mb-10">
          Escribe tu nombre o el nombre de tu marca que hará destacar tu tienda
        </p>
        <div className="flex items-baseline gap-1">
          <p>https://</p>
          <section className="w-full">
            <Input
              required
              onChange={(e) =>
                onChange?.(
                  e.currentTarget.value.trim().replaceAll("_", "").toLowerCase()
                )
              }
              value={value}
              placeholder="brendi_tienda"
            />
            <p className="text-red-500 text-xs">{error}</p>
          </section>
          <p>.easybits.cloud</p>
        </div>
      </div>
      <BrutalButton
        isDisabled={!value || value.length < 3}
        type="button"
        isLoading={isLoading}
        onClick={onClick}
        className="mt-auto w-full"
      >
        Continuar
      </BrutalButton>
    </motion.div>
  );
};
