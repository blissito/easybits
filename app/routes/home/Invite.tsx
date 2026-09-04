export const Invite = () => {
  return (
    <section className="border-t-[2px] border-t-black py-20 md:py-40 px-4 md:px-[5%] xl:px-0">
      <div className="bg-[#96B894]  max-w-7xl rounded-3xl text-3xl md:text-4xl lg:text-5xl font-bold mx-auto p-6 md:p-16 !leading-[1.5]">
        <h1 className="flex flex-wrap items-center">
          <span> ¿Eres experto&nbsp;</span>
          <span> en IA?</span>
          <span>
            {" "}
            <img className="mx-3 w-20" src="/home/logo-glasses.svg" />{" "}
          </span>
          <span> Tus agentes&nbsp;</span> <span> ya tienen&nbsp;</span>
          <span> nube.&nbsp;</span>
          <span> Empieza gratis&nbsp;</span> <span> y ahorra más de </span>
          <span className="inline-block bg-black text-white rounded-xl px-1 md:px-3 mx-1 md:mx-3">
            $50 USD
          </span>{" "}
          <span>al mes en&nbsp;</span> <span> cinco proveedores&nbsp;</span>
          <span> en dólares.&nbsp;</span>
          <span> Todo en pesos,&nbsp;</span>
          <span> sin mensualidad obligatoria.</span>
        </h1>
      </div>
    </section>
  );
};
