export const Footer = () => {
  return (
    <section className="bg-black">
      <div className="border-b-[1px] border-b-white/20 h-20">
        <div className="h-full max-w-7xl border-x-[1px] border-x-white/20 mx-auto"></div>
      </div>
      <div className="border-b-[1px] border-b-white/20 h-40 ">
        <div className="h-full max-w-7xl border-x-[1px] border-x-white/20 mx-auto">
          <button className="bg-brand-500 w-full h-full rounded-none transition-all text-[80px] font-medium hover:rounded-full">
            Empezar gratis
          </button>
        </div>
      </div>
      <div className="border-b-[1px] border-b-white/20 h-40 ">
        <div className="h-full max-w-7xl border-x-[1px] border-x-white/20 mx-auto">
          <button className="bg-brand-500 w-[50%] h-full rounded-none transition-all text-[80px] font-medium hover:rounded-full">
            Empezar gratis
          </button>
        </div>
      </div>
    </section>
  );
};
