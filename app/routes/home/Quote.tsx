export const Quote = () => {
  return (
    <section className="border-b-[1px] border-b-black min-h-[60vh] md:min-h-[80vh] grid place-content-center">
      <div className="max-w-7xl mx-auto -mt-20 flex flex-col items-center px-4 md:px-[5%] xl:px-0">
        <img src="/logo-purple.svg" className="mx-auto" alt="logo" />
        <h2 className="text-3xl md:text-4xl xl:text-6xl font-bold text-center leading-tight">
          Vender tu trabajo digital es fácil en EasyBits. Da de alta tu primer
          asset, personaliza tu sitio y comparte.
        </h2>
        <button className="text-xl mx-auto  mt-12 group ">
          Empieza ya{" "}
          <span className="text-2xl group-hover:animate-bounce"> &#8702;</span>
        </button>
      </div>
    </section>
  );
};
