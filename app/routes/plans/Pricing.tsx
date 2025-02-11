import { BrutalButton } from "~/components/common/BrutalButton";

export const Pricing = () => {
  return (
    <section className="pt-32 md:pt-[200px] mb-20  md:mb-40 text-center relative">
      <img
        className="absolute left-10 md:left-80 top-28 md:top-32"
        alt="star"
        src="/hero/star.svg"
      />
      <img
        className="absolute right-20 top-16 md:top-40 md:right-80 w-16"
        alt="star"
        src="/hero/waves.svg"
      />
      <img
        className="absolute w-8 left-[480px] top-80"
        alt="star"
        src="/hero/asterisk.svg"
      />

      <h2 className="text-4xl lg:text-6xl font-bold">Elige tu plan</h2>
      <p className="text-iron text-xl md:text-2xl mt-6">
        Explora entre más de 10,000 assets digitales
      </p>
      <div className="max-w-7xl mx-auto px-4 md:px-[5%] xl:px-0 mt-12 md:mt-20 flex flex-wrap gap-12 justify-center">
        <PlanCard
          badge="/hero/foco.svg"
          planName="Starter"
          classNameButton="bg-[#F6DB7F]"
          perks={[
            "1 asset en venta",
            "Dashboard de administración",
            "Landing page personalizable para tu asset",
            "Sistema de venta en línea con integración Stripe o Paypal",
            "1 GB de almacenamiento",
          ]}
        />
        <div className="mt-0 xl:-mt-6">
          <PlanCard
            badge="/hero/rocket.svg"
            planName="Creative"
            price={199}
            classNameButton="bg-[#A1CCE5]"
            perks={[
              "Assets ilimitados",
              "Dashboard de administración",
              "Landing page personalizable para cada uno de tus assets",
              "Sistema de venta en línea con integración Stripe o Paypal",
              "Configuración de tu propio dominio ",
              "50 GB de almacenamiento ",
            ]}
          />{" "}
        </div>
        <PlanCard
          badge="/hero/coder.svg"
          planName="Developer"
          price={299}
          perks={[
            "Todo lo del plan Creative",
            "200 GB de almacenamiento",
            "API para subida/visualización de archivos ",
            "Iframes PRO de video y audio para la visualización del contenido en tu web",
            "Optimización del contenido",
          ]}
        />
      </div>
    </section>
  );
};

export const PlanCard = ({
  badge,
  planName,
  price,
  perks = [],
  classNameButton,
}: {
  badge: string;
  planName: string;
  price?: number;
  perks: string[];
  classNameButton?: string;
}) => {
  return (
    <section className="bg-black max-w-[340px] rounded-xl group ">
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
          <BrutalButton
            containerClassName="w-full "
            className={classNameButton}
          >
            <span>¡Empezar!</span>
          </BrutalButton>
        </div>
      </div>
    </section>
  );
};

const PerkItem = ({ perk }: { perk?: string }) => {
  return (
    <div className="flex w-full gap-2 my-2">
      <img alt="bullet" src="/hero/bullet.svg" />
      <span>{perk}</span>
    </div>
  );
};
