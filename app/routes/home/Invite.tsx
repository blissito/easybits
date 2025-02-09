export const Invite = () => {
  return (
    <section className="border-t-[1px] border-t-black py-20 md:py-40 px-4 md:px-[5%] xl:px-0">
      <div className="bg-[#96B894]  max-w-7xl rounded-3xl text-3xl md:text-4xl lg:text-5xl font-bold mx-auto p-6 md:p-16 !leading-[1.5]">
        <h1 className="flex flex-wrap items-center">
          <span> ¿Eres un creativo digital?</span>
          <span>
            {" "}
            <img className="mx-3 w-20" src="/hero/logo-glasses.svg" />{" "}
          </span>
          <span> Empieza a vender tu</span>
          <span>
            {" "}
            trabajo en EasyBits completamente gratis. Ahorra más de{" "}
            <span className="inline-block bg-black text-white rounded-xl px-3 mx-3">
              $100 USD
            </span>
            mensuales en infraestructura y hazlo todo fácil desde EasyBits.
          </span>
        </h1>
      </div>
    </section>
  );
};
