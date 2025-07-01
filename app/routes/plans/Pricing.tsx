import type { FormEvent, ReactNode } from "react";
import { useFetcher } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { TextBlurEffect } from "~/components/TextBlurEffect";
import { cn } from "~/utils/cn";

export const Pricing = () => {
  return (
    <section className="pt-32 md:pt-[200px] mb-20  md:mb-40 text-center relative px-4 md:px-[5%] xl:px-0">
      <img
        className="absolute left-10 scale-75 md:scale-100 md:left-80 top-28 md:top-32"
        alt="star"
        src="/home/star.svg"
      />
      <img
        className="absolute right-20 scale-75 md:scale-100 top-16 md:top-40 md:right-80 w-16"
        alt="star"
        src="/home/waves.svg"
      />
      <img
        className="absolute w-8 left-[480px] top-80"
        alt="star"
        src="/home/asterisk.svg"
      />
      <TextBlurEffect>
        <h2 className="text-4xl lg:text-6xl font-bold">Elige tu plan</h2>
        <p className="text-iron text-xl md:text-2xl mt-4 md:mt-6">
          Planes flexibles para cada etapa de tu negocio creativo
        </p>
      </TextBlurEffect>
      <div className="max-w-7xl mx-auto px-4 md:px-[5%] xl:px-0 mt-12 lg:mt-20 flex flex-wrap gap-12 justify-center">
        <PlanCard
          badge="/home/foco.svg"
          planName="Starter"
          classNameButton="bg-[#F6DB7F] w-full"
          perks={[
            "1 asset en venta",
            "Landing page personalizable para tu asset",
            "Website propio personalizable ",
            "Sistema de venta en línea con integración Stripe ",
            "500 mb de almacenamiento",
          ]}
        />
        <div className="mt-0 xl:-mt-6">
          <PlanCard
            badge="/home/rocket.svg"
            planName="Creative"
            price={199}
            classNameButton="bg-[#A1CCE5] w-full"
            perks={[
              "Assets ilimitados",
              "Landing page personalizable para cada uno de tus assets",
              "Landing page personalizable para tu asset",
              "Website propio personalizable ",
              "Sistema de venta en línea con integración Stripe ",
              "Configuración de tu propio dominio ",
              "50 GB de almacenamiento ",
              "AI Features",
            ]}
            cta={
              <PlanForm
                id="creative_plan"
                intent="creative_plan"
                buttonClassName="bg-[#A1CCE5]"
              />
            }
          />{" "}
        </div>
        <PlanCard
          classNameButton="w-full"
          badge="/home/coder.svg"
          planName="Expert"
          price={299}
          perks={[
            "Todo lo del plan Creative",
            "+150 GB de almacenamiento (200 GB en total)",
            "API para subida/visualización de archivos ",
            "Iframes PRO de video y audio para la visualización del contenido en tu web",
            "Optimización del contenido (HSL / webp)",
          ]}
          cta={<PlanForm id="expert_plan" intent="expert_plan" />}
        />
      </div>
    </section>
  );
};

const PlanForm = ({
  intent,
  buttonClassName,
  id,
}: {
  buttonClassName?: string;
  intent: string;
  id?: string;
}) => {
  const fetcher = useFetcher();
  return (
    <fetcher.Form action="/api/v1/stripe/plans" method="post">
      <BrutalButton
        name="intent"
        value={intent}
        isLoading={fetcher.state !== "idle"}
        type="submit"
        className={cn("w-full", buttonClassName)}
        containerClassName={cn("w-full")}
        id={id} // shouldn't be in form container?
      >
        <span>¡Empezar!</span>
      </BrutalButton>
    </fetcher.Form>
  );
};

export const PlanCard = ({
  badge,
  planName,
  price,
  perks = [],
  classNameButton,
  cta,
}: {
  badge: string;
  planName: string;
  price?: number;
  perks: string[];
  classNameButton?: string;
  cta?: ReactNode;
}) => {
  const button = cta || (
    <BrutalButton
      className={cn("w-full bg-[#F6DB7F]", classNameButton)}
      containerClassName="w-full"
      id="EmpezarPlanes"
    >
      <span>¡Empezar!</span>
    </BrutalButton>
  );
  return (
    <section className="bg-black h-full max-w-[340px] rounded-xl group ">
      <div className="bg-white border-2 border-black rounded-xl py-6 text-left group-hover:-translate-x-2 group-hover:-translate-y-2 transition-all">
        <div className="px-6 border-b-2 border-black pb-4">
          <img alt="foco" src={badge} />
          <h3 className="text-2xl font-semibold mt-4 mb-2">{planName}</h3>
          <p className="text-black text-4xl font-bold">
            ${price ? price : "0"} mxn{" "}
            <span className="text-base text-iron font-light">/ mes</span>{" "}
          </p>
        </div>
        <div className="pt-4 px-6  ">
          <div className="min-h-[308px] ">
            <p className="font-semibold mb-3">¿Qué incluye?</p>
            {perks.map((perk, index) => (
              <PerkItem perk={perk} key={index} />
            ))}
          </div>
          <div className="mt-6">{button} </div>
        </div>
      </div>
    </section>
  );
};

export const PerkItem = ({ perk }: { perk?: string }) => {
  return (
    <div className="flex w-full items-start gap-2 my-2">
      <img alt="bullet" src="/home/bullet.svg" className="mt-[2px]" />
      <span>{perk}</span>
    </div>
  );
};
