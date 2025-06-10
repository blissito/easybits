import { Link } from "react-router";
import { BrutalButton } from "./BrutalButton";

export const NotFound = ({
  message,
  details,
}: {
  message?: string;
  details?: string;
}) => {
  return (
    <section className="z-10 relative grid max-w-2xl mx-auto place-content-center place-items-center min-h-[60vh] md:min-h-[80vh] ">
      <div className="w-48 mx-auto md:w-80 flex justify-center">
        <img src="/404-eb.webp" alt="404" />
      </div>
      <h2 className="text-2xl font-bold mt-4 mb-3">
        {message === "404" ? "  ¡Vaya, vaya! Esta página no existe" : message}
      </h2>
      <p className="text-lg text-iron text-center mb-10">
        {details === "The requested page could not be found."
          ? " Esta página no está disponible o ha sido desactivada, pero no te desanimes, vuelve a la página principal o explora los assets en Comunidad EasyBits."
          : details}
      </p>
      <div className="flex gap-6">
        <Link to="/inicio">
          {" "}
          <BrutalButton mode="ghost">Volver al Inicio</BrutalButton>
        </Link>
        <Link to="/comunidad">
          <BrutalButton className="bg-brand-500">
            Explorar Comunidad
          </BrutalButton>{" "}
        </Link>
      </div>
    </section>
  );
};
