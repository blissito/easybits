export const Steps = () => {
  return (
    <section className=" max-w-7xl mx-auto py-20 md:py-40 px-4 md:px-[5%] xl:px-0">
      <h2 className="text-3xl md:text-5xl font-bold text-center mb-12 md:mb-20">
        Tu agente en producción en tres pasos
      </h2>
      <div className="w-full grid grid-col-1 md:grid-cols-3 gap-10 lg:gap-24">
        <StepCard
          title="Conecta el MCP"
          text="Pega easybits.cloud/api/mcp en Claude Code, Cursor o tu SDK. Una API key y ya."
        />
        <StepCard
          title="Dale una caja y la web"
          image="/home/step2.webp"
          text="Tu agente ejecuta código en su microVM, lee cualquier sitio y guarda lo que produce."
        />
        <StepCard
          title="Publica o cobra"
          text="Lanza la app, el documento o el bot de WhatsApp. Al cliente le vendes tú; nosotros te cobramos en MXN."
          image="/home/step3.webp"
        />
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
          src={image ? image : "/home/step1.webp"}
        />{" "}
      </div>
      <h2 className="text-2xl font-bold mt-6 md:mt-14">{title}</h2>
      <p className="text-iron mt-2 md:mt-4">{text}</p>
    </div>
  );
};
