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
    <BrutalElement className="border-2">
      <div className="flex w-full gap-4 col-span-1   bg-white p-4 md:p-6 items-center ">
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
        Disfruta de los beneficios de EasyBits
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-12">
        <BenefitCard
          image="/hero/easy.svg"
          title="Fácil de usar"
          description="Para vender tus assets en EasyBits no necesitas ser un pro de la tecnología, agregar y vender tus productos es fácil y no te tomará más de 5 minutos. Y si tienes preguntas, siempre estaremos para ayduarte."
        />
        <BenefitCard
          image="/hero/support.svg"
          title="Servicio de soporte"
          description="Nuestro equipo estará detrás de cada uno de nuestros medio de contacto prespondiento tus preguntas, ayudandote e incluso tomando notas de lo que te gustaría agregar a EasyBits. "
        />
        <BenefitCard
          image="/hero/custom.svg"
          title="Personalización"
          description="En EasyBits puedes personalizar cada landing page de tus assets, agregar tus colores, mostrar solo la información que tu quieres, e incluso agregar tu propio dominio."
        />
        <BenefitCard
          image="/hero/cancel.svg"
          title="Cancelación "
          description="Nada de plazos forzosos. Puedes cancelar en el momento que tu quieres, sin letras chiquitas y sin trabas, tú tienes control sobre tu suscripción."
        />
      </div>
    </section>
  );
};
