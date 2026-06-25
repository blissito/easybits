import type { FormEvent, ReactNode } from "react";
import { useFetcher, Link } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { TextBlurEffect } from "~/components/TextBlurEffect";
import { cn } from "~/utils/cn";
import { PLANS, effectivePrice } from "~/lib/plans";

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
      <div className="mx-auto mt-12 lg:mt-20 grid grid-cols-1 md:grid-cols-3 gap-3 lg:gap-6 items-stretch max-w-5xl">
        <PlanCard
          badge="/home/foco.svg"
          planName={PLANS.Byte.name}
          price={PLANS.Byte.price}
          classNameButton="bg-[#F6DB7F] w-full"
          perks={PLANS.Byte.features}
        />
        <PlanCard
          badge="/home/rocket.svg"
          planName={PLANS.Mega.name}
          price={effectivePrice("Mega")}
          listPrice={PLANS.Mega.price}
          promoLabel={PLANS.Mega.promoLabel}
          classNameButton="bg-[#A1CCE5] w-full"
          perks={PLANS.Mega.features}
          className="lg:-translate-y-6"
          cta={
            <PlanForm
              id="flow_plan"
              intent="flow_plan"
              buttonClassName="bg-[#A1CCE5]"
            />
          }
        />
        <PlanCard
          classNameButton="w-full"
          badge="/home/coder.svg"
          planName={PLANS.Tera.name}
          price={PLANS.Tera.price}
          perks={PLANS.Tera.features}
          cta={<PlanForm id="studio_plan" intent="studio_plan" />}
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
  listPrice,
  promoLabel,
  perks = [],
  classNameButton,
  className,
  cta,
}: {
  badge: string;
  planName: string;
  price?: number;
  /** Regular list price shown struck-through when a promo is active (listPrice > price). */
  listPrice?: number;
  /** Promo badge label (e.g. "Promoción"). */
  promoLabel?: string;
  perks: string[];
  classNameButton?: string;
  className?: string;
  cta?: ReactNode;
}) => {
  const showPromo = listPrice != null && price != null && listPrice > price;
  const button = cta || (
    <Link to="/login">
      <BrutalButton
        className={cn("w-full bg-[#F6DB7F]", classNameButton)}
        containerClassName="w-full"
        id="EmpezarPlanes"
      >
        <span>¡Empezar!</span>
      </BrutalButton>
    </Link>
  );
  return (
    <section className={cn("h-full rounded-xl group max-w-[340px] md:max-w-none mx-auto", className)}>
      <div className="bg-white border-2 border-black rounded-xl overflow-hidden py-6 text-left shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] group-hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] group-hover:-translate-x-1 group-hover:-translate-y-1 transition-all h-full flex flex-col">
        <div className="px-6 border-b-2 border-black pb-4">
          <img alt="foco" src={badge} />
          <div className="flex items-center gap-2 mt-4 mb-2">
            <h3 className="text-2xl font-semibold">{planName}</h3>
            {showPromo && (
              <span className="text-xs font-bold bg-[#9870ED] text-white px-2 py-0.5 rounded-full">
                {promoLabel || "Promoción"}
              </span>
            )}
          </div>
          <p className="text-black text-4xl font-bold">
            {showPromo && (
              <span className="text-iron text-2xl font-normal line-through mr-2">
                ${listPrice}
              </span>
            )}
            ${price ? price : "0"} mxn{" "}
            <span className="text-base text-iron font-light">/ mes</span>{" "}
          </p>
        </div>
        <div className="pt-4 px-6 flex flex-col flex-1">
          <div className="flex-1">
            <p className="font-semibold mb-3">¿Qué incluye?</p>
            {perks.map((perk, index) => (
              <PerkItem perk={perk} key={index} />
            ))}
          </div>
          <div className="mt-6">{button}</div>
        </div>
      </div>
    </section>
  );
};

export const PerkItem = ({ perk }: { perk?: string }) => {
  const highlight = !!perk && /sandbox/i.test(perk);
  return (
    <div className="flex w-full items-start gap-2 my-2">
      <img alt="bullet" src="/home/bullet.svg" className="mt-[2px]" />
      <span className={"text-sm" + (highlight ? " font-semibold text-brand-700" : "")}>
        {highlight && (
          <span className="mr-1.5 align-middle text-[10px] font-bold uppercase tracking-wide bg-brand-500 text-white px-1.5 py-[1px] rounded">
            Nuevo
          </span>
        )}
        {perk}
      </span>
    </div>
  );
};
