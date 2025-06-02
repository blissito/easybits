export const Steps = () => {
  return (
    <section className=" max-w-7xl mx-auto py-20 md:py-40 px-4 md:px-[5%] xl:px-0">
      <h2 className="text-3xl md:text-5xl font-bold text-center mb-12 md:mb-20">
        ¡Empieza hoy mismo!
      </h2>
      <div className="w-full grid grid-col-1 md:grid-cols-3 gap-10 lg:gap-24">
        <StepCard
          title="Crea tu primer asset"
          text="Elige ese libro, cuento o ilustración en la que has trabajado tanto y conviételo en un asset. Agrega fotos y una descripción que enamore a tus clientes. "
        />
        <StepCard
          title="Personaliza tu website"
          image="/hero/step2.webp"
          text="Que tu website combine contigo y con tu marca, completa tu información y personaliza la tipografía, los colores y el tema."
        />
        <StepCard
          title="Comparte y logra tu primera venta"
          text="¡Tu website esta listo para su primera venta! compártelo en tus redes sociales con tus seguidores o clientes. "
          image="/hero/step3.webp"
        />{" "}
      </div>
    </section>
  );
};

const StepCard = ({
  title,
  image,
  text,
}: {
  title: string;
  image?: string;
  text: string;
}) => {
  return (
    <div className="text-center flex flex-col justify-center items-center">
      <div className="h-fit  md:h-[322px]">
        <img
          className="w-3/4 mx-auto md:w-full h-auto "
          src={image ? image : "/hero/step1.webp"}
        />{" "}
      </div>
      <h2 className="text-2xl font-bold mt-6 md:mt-14">{title}</h2>
      <p className="text-iron mt-2 md:mt-4">{text}</p>
    </div>
  );
};
