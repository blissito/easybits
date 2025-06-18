export const Invite = () => {
  return (
    <section className="border-t-[2px] border-t-black py-20 md:py-40 px-4 md:px-[5%] xl:px-0">
      <div className="bg-[#96B894]  max-w-7xl rounded-3xl text-3xl md:text-4xl lg:text-5xl font-bold mx-auto p-6 md:p-16 !leading-[1.5]">
        <h1 className="flex flex-wrap items-center">
          <span> ¿Eres un creativo&nbsp;</span>
          <span> digital?</span>
          <span>
            {" "}
            <img className="mx-3 w-20" src="/home/logo-glasses.svg" />{" "}
          </span>
          <span> Empieza a</span> &nbsp; <span> vender&nbsp;</span>{" "}
          <span>tu&nbsp;</span>
          <span> trabajo en&nbsp;</span> <span> EasyBits</span> &nbsp;
          <span>completamente&nbsp;</span> <span> gratis. &nbsp;</span>{" "}
          <span> Ahorra más de </span>
          <span className="inline-block bg-black text-white rounded-xl px-1 md:px-3 mx-1 md:mx-3">
            $50 USD
          </span>{" "}
          <span>mensuales en&nbsp;</span> <span> infraestructura&nbsp;</span>
          <span> y hazlo&nbsp;</span>
          <span> todo fácil con EasyBits.</span>
        </h1>
      </div>
    </section>
  );
};
