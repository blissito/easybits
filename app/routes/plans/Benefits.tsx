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
    <BrutalElement>
      <div className="flex w-full gap-4 col-span-1 rounded-xl border-[2px] bg-white border-black p-4 md:p-6 items-center ">
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
          description="Lorem ipsum dolor sit amet consectetur. Feugiat in nisl pulvin Nunc pretium pretium vitae aliquet aliquam imperdiet odio egestas. Quam viverra amet tortor."
        />
        <BenefitCard
          image="/hero/support.svg"
          title="Fácil de usar"
          description="Lorem ipsum dolor sit amet consectetur. Feugiat in nisl pulvin Nunc pretium pretium vitae aliquet aliquam imperdiet odio egestas. Quam viverra amet tortor."
        />
        <BenefitCard
          image="/hero/custom.svg"
          title="Fácil de usar"
          description="Lorem ipsum dolor sit amet consectetur. Feugiat in nisl pulvin Nunc pretium pretium vitae aliquet aliquam imperdiet odio egestas. Quam viverra amet tortor."
        />
        <BenefitCard
          image="/hero/cancel.svg"
          title="Fácil de usar"
          description="Lorem ipsum dolor sit amet consectetur. Feugiat in nisl pulvin Nunc pretium pretium vitae aliquet aliquam imperdiet odio egestas. Quam viverra amet tortor."
        />
      </div>
    </section>
  );
};
