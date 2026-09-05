import { BrutalElement } from "~/components/common/BrutalElement";

const BenefitCard = ({
  image,
  title,
  description,
}: {
  image: string;
  title: string;
  description: string;
}) => {
  return (
    <BrutalElement className="border-2 h-full">
      <div className="flex w-full gap-4 col-span-1 h-full bg-white p-4 md:p-6 items-center ">
        <img className="w-16 h-16" alt="bullet" src={image} />
        <div className="text-left">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p>{description}</p>
        </div>
      </div>
    </BrutalElement>
  );
};

export const Benefits = () => {
  return (
    <section className="max-w-7xl mx-auto py-20 md:py-40 px-4 md:px-[5%] xl:px-0">
      <h2 className="text-3xl md:text-5xl font-bold text-center mb-12 md:mb-20">
        Por qué construir aquí
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-12">
        <BenefitCard
          image="/home/easy.svg"
          title="Tu agente ya sabe usarlo"
          description="Conectas un endpoint MCP y listo: no escribes wrappers ni enseñas a tu agente a llamar la API. Lo que puede hacer la interfaz, lo puede hacer el agente."
        />
        <BenefitCard
          image="/home/support.svg"
          title="Precios en pesos"
          description="Sin conversión ni sorpresas por tipo de cambio. Cobramos en MXN y facturamos en México, que es justo lo que la infraestructura de agentes no ofrece."
        />
        <BenefitCard
          image="/home/custom.svg"
          title="Tus llaves o las nuestras"
          description="Trae tus propias llaves de modelo y págananos solo el software, o usa las nuestras y te revendemos tokens en pesos. Se decide por agente, y se puede cambiar."
        />
        <BenefitCard
          image="/home/cancel.svg"
          title="Cancelación"
          description="Nada de plazos forzosos. Cancelas cuando quieras, sin letras chiquitas; y lo que ya compraste en packs no caduca."
        />
      </div>
    </section>
  );
};
