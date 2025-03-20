import { BsStripe } from "react-icons/bs";
import { FaPaypal } from "react-icons/fa";
import { BrutalButton } from "~/components/common/BrutalButton";
import { Header } from "~/components/layout/Header";
import { cn } from "~/utils/cn";
import { SalesTable } from "./sales/SalesTable";

const LAYOUT_PADDING = "py-6 md:py-10"; // to not set padding at layout level (so brendi's design can be acomplished)

export default function Sales() {
  return (
    <>
      <article
        className={cn(
          " min-h-screen w-full relative box-border inline-block max-w-7xl mx-auto px-4 md:px-[5%] lg:px-0",
          LAYOUT_PADDING
        )}
      >
        <Header title="Ventas" />
        <EmptySales />
        {/* <SalesTable /> */}
      </article>
    </>
  );
}

const EmptySales = () => {
  return (
    <section className="w-fit mx-auto max-w-[480px] text-center h-[calc(100%-200px)]  flex items-center ">
      <div>
        <img className="w-52 mx-auto" src="/sales-empty.webp" />
        <h3 className="text-2xl font-semibold mt-8 mb-3">
          {/* Administra tus ventas desde aquí */}
          Conecta una pasarela de pagos
        </h3>
        <p className="whitespace-pre-line text-iron">
          {/* Podrás ver la información de cada venta cada vez que un cliente compre
          uno de tus assets. */}
          Conecta tu pasarela preferida, EasyBits colabora con Stripe & PayPal
          para ofrecerte pagos seguros.
        </p>{" "}
        <div className="flex gap-6 justify-center mt-10">
          <BrutalButton className="bg-sea flex gap-2 items-center">
            Conectar PayPal <FaPaypal />
          </BrutalButton>
          <BrutalButton className="bg-[#6772E5] flex gap-2 items-center">
            Conectar Stripe
            <BsStripe />
          </BrutalButton>
        </div>
      </div>
    </section>
  );
};
