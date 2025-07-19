import { Link } from "react-router";

export const Quote = () => {
  return (
    <section className="border-b-2 border-b-black min-h-[60vh] md:min-h-[80vh] grid place-content-center">
      <div className="max-w-7xl mx-auto -mt-20 flex flex-col items-center px-4 md:px-[5%] xl:px-0">
        <img src="/logo-purple.svg" className="mx-auto" alt="logo" />
        <h2 className="text-3xl md:text-4xl xl:text-6xl font-bold text-center leading-tight!">
          Vender tu trabajo digital es fácil en EasyBits. Crea tu primer asset,
          personaliza tu sitio, comparte y empieza a vender.
        </h2>
        <Link to="/login">
          <button className="text-xl mx-auto  mt-12 group gap-2 items-center flex">
            Crear una cuenta ya{" "}
            <p className="text-2xl transition-all group-hover:animate-moving">
              {" "}
              &#8702;
            </p>
          </button>{" "}
        </Link>
      </div>
    </section>
  );
};
